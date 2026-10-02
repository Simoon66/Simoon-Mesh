import React, { useState, useEffect } from 'react';
import {
  simoonClient,
  SimoonMeshEvent,
} from './core/SimoonMeshClient.ts';
import { localDB } from './core/storage/db.ts';
import {
  ChatMessage,
  FileTransferRecord,
  TransportStats,
  TransportState,
  SimoonIdentity,
  ProtocolLogEntry,
} from './types/index.ts';
import { Header } from './components/Header.tsx';
import { ChatView } from './components/ChatView.tsx';
import { ConnectView } from './components/ConnectView.tsx';
import { FilesView } from './components/FilesView.tsx';
import { SecurityView } from './components/SecurityView.tsx';
import { TestingPanel } from './components/TestingPanel.tsx';
import { ContactsModal } from './components/ContactsModal.tsx';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'connect' | 'files' | 'security'>('chat');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);

  // Client states
  const [myIdentity, setMyIdentity] = useState<SimoonIdentity | null>(null);
  const [connectionState, setConnectionState] = useState<TransportState>('disconnected');
  const [connectedPeer, setConnectedPeer] = useState<SimoonIdentity | null>(null);

  // Message & Transfer state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transfers, setTransfers] = useState<Map<string, FileTransferRecord>>(new Map());
  const [transfersList, setTransfersList] = useState<FileTransferRecord[]>([]);

  // Diagnostics state
  const [stats, setStats] = useState<TransportStats>({
    bytesSent: 0,
    bytesReceived: 0,
    currentRateBytesPerSec: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bufferedAmount: 0,
    lastActiveTimestamp: Date.now(),
  });
  const [logs, setLogs] = useState<ProtocolLogEntry[]>([]);
  const [isPeerTyping, setIsPeerTyping] = useState<boolean>(false);

  // Initialize client on mount
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function setup() {
      try {
        await simoonClient.init();
        setMyIdentity(simoonClient.identity);

        // Load persisted messages and transfers from IndexedDB
        const storedMsgs = await localDB.getMessages();
        setMessages(storedMsgs);

        const storedTransfers = await localDB.getTransfers();
        setTransfersList(storedTransfers);

        const transferMap = new Map<string, FileTransferRecord>();
        storedTransfers.forEach(t => transferMap.set(t.transferId, t));
        setTransfers(transferMap);

        // Subscribe to client mesh events
        unsubscribe = simoonClient.subscribe((event: SimoonMeshEvent) => {
          if (event.type === 'STATE_CHANGED') {
            setConnectionState(event.state);
          } else if (event.type === 'PEER_CONNECTED') {
            setConnectedPeer(event.peer);
            setConnectionState('connected');
            // When connected, switch to chat
            setActiveTab('chat');
          } else if (event.type === 'PEER_DISCONNECTED') {
            setConnectedPeer(null);
            setConnectionState('disconnected');
            setIsPeerTyping(false);
          } else if (event.type === 'TYPING_STATUS') {
            setIsPeerTyping(event.isTyping);
          } else if (event.type === 'MESSAGE_RECEIVED') {
            setIsPeerTyping(false);
            setMessages(prev => {
              // Avoid duplicate messages
              if (prev.some(m => m.id === event.message.id)) {
                return prev.map(m => m.id === event.message.id ? event.message : m);
              }
              return [...prev, event.message];
            });
          } else if (event.type === 'MESSAGE_EDITED') {
            setMessages(prev =>
              prev.map(m =>
                m.id === event.messageId
                  ? { ...m, text: event.newText, isEdited: true, editedAt: event.editedAt }
                  : m
              )
            );
          } else if (event.type === 'MESSAGE_UNSENT') {
            setMessages(prev => prev.filter(m => m.id !== event.messageId));
          } else if (event.type === 'TRANSFER_UPDATED') {
            setTransfers(prev => {
              const updated = new Map(prev);
              updated.set(event.transfer.transferId, event.transfer);
              return updated;
            });
            setTransfersList(prev => {
              const idx = prev.findIndex(t => t.transferId === event.transfer.transferId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = event.transfer;
                return next;
              }
              return [event.transfer, ...prev];
            });
          } else if (event.type === 'STATS_UPDATED') {
            setStats(event.stats);
          } else if (event.type === 'LOG_ENTRY') {
            setLogs(prev => [event.log, ...prev].slice(0, 100));
          }
        });

        // Check if URL has ?peer=XXXX or ?join=XXXX
        const urlParams = new URLSearchParams(window.location.search);
        const peerParam = urlParams.get('peer');
        const joinParam = urlParams.get('join');

        if (joinParam) {
          setActiveTab('connect');
          setTimeout(() => {
            simoonClient.joinPairingSession(joinParam).catch(console.error);
          }, 800);
        } else if (peerParam && peerParam !== simoonClient.identity.id) {
          setActiveTab('connect');
          setTimeout(() => {
            simoonClient.connectToPeer(peerParam).catch(console.error);
          }, 800);
        }

        setIsReady(true);
      } catch (err) {
        console.error('Failed to initialize SIMOON MESH:', err);
      }
    }

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handlers
  const handleSendMessage = async (text: string) => {
    await simoonClient.sendMessage(text);
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId
          ? { ...m, text: newText, isEdited: true, editedAt: Date.now() }
          : m
      )
    );
    await simoonClient.editText(messageId, newText);
  };

  const handleDeleteMessageForMe = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await simoonClient.deleteMessageForMe(messageId);
  };

  const handleDeleteMessageForEveryone = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await simoonClient.deleteMessageForEveryone(messageId);
  };

  const handleSendTypingStatus = (isTyping: boolean) => {
    simoonClient.sendTypingStatus(isTyping).catch(() => {});
  };

  const handleClearChat = async () => {
    setMessages([]);
    await localDB.clearMessages();
  };

  const handleSendFile = async (file: File) => {
    await simoonClient.sendFile(file);
  };

  const handleCancelTransfer = (transferId: string) => {
    simoonClient.fileManager.cancelTransfer(transferId);
  };

  const handleConnectPeer = async (peerId: string) => {
    await simoonClient.connectToPeer(peerId);
  };

  const handleDisconnectPeer = async () => {
    await simoonClient.disconnect();
  };

  const handleCreateAirgapOffer = async () => {
    return await simoonClient.createAirgapOffer();
  };

  const handleAcceptAirgapOffer = async (offerToken: string) => {
    return await simoonClient.acceptAirgapOffer(offerToken);
  };

  const handleAcceptAirgapAnswer = async (answerToken: string) => {
    await simoonClient.acceptAirgapAnswer(answerToken);
  };

  const handleCreatePairingSession = async () => {
    return await simoonClient.createPairingSession();
  };

  const handleJoinPairingSession = async (code: string) => {
    return await simoonClient.joinPairingSession(code);
  };

  const handleResetNode = async () => {
    await simoonClient.resetNode();
  };

  if (!isReady || !myIdentity) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 text-neutral-200">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
          <div className="space-y-0.5">
            <span className="font-display text-lg font-bold tracking-wider text-neutral-100">
              SIMOON MESH
            </span>
            <div className="text-xs text-neutral-500 font-mono">
              Generating local cryptographic identity...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-200">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connectionState={connectionState}
        connectedPeerId={connectedPeer ? connectedPeer.id : null}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics(prev => !prev)}
        onOpenContacts={() => setShowContactsModal(true)}
        myId={myIdentity.id}
      />

      <main className="flex-1">
        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            transfers={transfers}
            connectedPeer={connectedPeer}
            connectionState={connectionState}
            isPeerTyping={isPeerTyping}
            onSendTypingStatus={handleSendTypingStatus}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessageForMe={handleDeleteMessageForMe}
            onDeleteMessageForEveryone={handleDeleteMessageForEveryone}
            onSendFile={handleSendFile}
            onCancelTransfer={handleCancelTransfer}
            onNavigateToConnect={() => setActiveTab('connect')}
            onOpenContacts={() => setShowContactsModal(true)}
            onClearChat={handleClearChat}
          />
        )}

        {activeTab === 'connect' && (
          <ConnectView
            myIdentity={myIdentity}
            connectionState={connectionState}
            connectedPeer={connectedPeer}
            onConnect={handleConnectPeer}
            onDisconnect={handleDisconnectPeer}
            onCreatePairingSession={handleCreatePairingSession}
            onJoinPairingSession={handleJoinPairingSession}
            onCreateAirgapOffer={handleCreateAirgapOffer}
            onAcceptAirgapOffer={handleAcceptAirgapOffer}
            onAcceptAirgapAnswer={handleAcceptAirgapAnswer}
            lastError={stats.lastError}
          />
        )}

        {activeTab === 'files' && (
          <FilesView transfers={transfersList} />
        )}

        {activeTab === 'security' && (
          <SecurityView
            myIdentity={myIdentity}
            storedKeys={simoonClient.storedKeys}
            messagesCount={messages.length}
            transfersCount={transfersList.length}
            onResetNode={handleResetNode}
          />
        )}
      </main>

      {/* Diagnostics Side Drawer */}
      <TestingPanel
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        connectionState={connectionState}
        connectedPeer={connectedPeer}
        stats={stats}
        logs={logs}
        myIdentity={myIdentity}
        onClearLogs={() => setLogs([])}
      />

      {/* Saved Contacts & Address Book Modal */}
      <ContactsModal
        isOpen={showContactsModal}
        onClose={() => setShowContactsModal(false)}
        onSelectPeerToConnect={(peerId) => {
          simoonClient.connectToPeer(peerId);
          setActiveTab('connect');
        }}
        connectedPeerId={connectedPeer ? connectedPeer.id : null}
      />
    </div>
  );
}
