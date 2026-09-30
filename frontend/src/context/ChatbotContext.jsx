import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { useAppContext } from "./AppContext";
import { getDefaultChainId } from "../config/chains";
import { getFriendlyErrorMessage } from "../utils/errors";

const ChatbotContext = createContext();
const CHATBOT_API_URL = import.meta.env.VITE_CHATBOT_API_URL || "";

export const useChatbotContext = () => useContext(ChatbotContext);

const normalizeAddress = (address) => address ? address.toLowerCase() : "";

export const ChatbotProvider = ({ children }) => {
    const { smartAccountAddress, eoaAddress, chainId, trackOp } = useAppContext();
    const [agents, setAgents] = useState([]);
    const [activeAgentAddress, setActiveAgentAddress] = useState("");
    const [messagesByAgent, setMessagesByAgent] = useState({});
    const [isChatLoading, setIsChatLoading] = useState(false);

    const activeAgent = useMemo(() => (
        agents.find((agent) => normalizeAddress(agent.agentAddress) === normalizeAddress(activeAgentAddress)) || null
    ), [agents, activeAgentAddress]);

    const messages = activeAgentAddress ? messagesByAgent[normalizeAddress(activeAgentAddress)] || [] : [];
    const isAgentConfigured = agents.some((agent) => agent.authorized !== false);
    const agentStatus = activeAgent || agents.find((agent) => agent.authorized !== false) || null;

    useEffect(() => {
        const matchesCurrentAccount = (detail = {}) => {
            if (!smartAccountAddress) return false;
            if (detail.smartAccountAddress && normalizeAddress(detail.smartAccountAddress) !== normalizeAddress(smartAccountAddress)) {
                return false;
            }
            if (detail.chainId && chainId && String(detail.chainId) !== String(chainId)) {
                return false;
            }
            return true;
        };

        const handleModuleRevoked = (event) => {
            if (!matchesCurrentAccount(event.detail)) return;
            setAgents([]);
            setActiveAgentAddress("");
            setMessagesByAgent({});
        };

        const handleAgentRevoked = (event) => {
            const detail = event.detail || {};
            if (!matchesCurrentAccount(detail) || !detail.agentAddress) return;
            const revokedKey = normalizeAddress(detail.agentAddress);
            setAgents((prev) => prev.map((agent) => (
                normalizeAddress(agent.agentAddress) === revokedKey
                    ? { ...agent, authorized: false, revoked: true, status: "revoked", txHashRevoke: detail.txHashRevoke }
                    : agent
            )));
            setActiveAgentAddress((current) => {
                if (normalizeAddress(current) !== revokedKey) return current;
                const nextAgent = agents.find((agent) => normalizeAddress(agent.agentAddress) !== revokedKey && agent.authorized !== false && !agent.revoked);
                return nextAgent?.agentAddress || "";
            });
        };

        window.addEventListener("aa-session-key-module-revoked", handleModuleRevoked);
        window.addEventListener("aa-session-key-agent-revoked", handleAgentRevoked);
        return () => {
            window.removeEventListener("aa-session-key-module-revoked", handleModuleRevoked);
            window.removeEventListener("aa-session-key-agent-revoked", handleAgentRevoked);
        };
    }, [smartAccountAddress, chainId, agents]);

    const setAgentMessages = (agentAddress, updater) => {
        const key = normalizeAddress(agentAddress);
        if (!key) return;
        setMessagesByAgent((prev) => {
            const currentMessages = prev[key] || [];
            const nextMessages = typeof updater === "function" ? updater(currentMessages) : updater;
            return { ...prev, [key]: nextMessages };
        });
    };

    const upsertAgent = (agent, forceAuthorized = false) => {
        if (!agent?.agentAddress) return;
        const nextAgent = {
            ...agent,
            authorized: forceAuthorized ? true : Boolean(agent.authorized)
        };
        setAgents((prev) => {
            const key = normalizeAddress(nextAgent.agentAddress);
            const exists = prev.some((item) => normalizeAddress(item.agentAddress) === key);
            if (exists) {
                return prev.map((item) => normalizeAddress(item.agentAddress) === key ? { ...item, ...nextAgent } : item);
            }
            return [...prev, nextAgent];
        });
        setActiveAgentAddress(nextAgent.agentAddress);
    };

    const refreshAgents = useCallback(async () => {
        if (!smartAccountAddress) {
            setAgents([]);
            setActiveAgentAddress("");
            setMessagesByAgent({});
            return [];
        }
        try {
            const activeChainId = chainId ? chainId.toString() : String(getDefaultChainId());
            const res = await axios.get(`${CHATBOT_API_URL}/api/agent/status/${smartAccountAddress}?chainId=${activeChainId}`);
            const allAgents = Array.isArray(res.data.agents)
                ? res.data.agents
                : res.data.configured
                    ? [{
                        agentAddress: res.data.agentAddress,
                        scope: res.data.scope,
                        maxAmount: res.data.maxAmount,
                        authorized: true
                    }]
                    : [];

            // Only show agents that are active — filter out revoked/expired noise
            const nextAgents = allAgents.filter(
                (a) => a.authorized !== false && a.status !== 'revoked' && a.status !== 'expired' && !a.revoked
            );

            setAgents(nextAgents);
            if (nextAgents.length > 0) {
                setActiveAgentAddress((current) => {
                    const stillExists = nextAgents.some((agent) => normalizeAddress(agent.agentAddress) === normalizeAddress(current));
                    if (stillExists) return current;
                    const firstAuthorized = nextAgents.find((agent) => agent.authorized !== false && !agent.revoked && agent.status !== "expired");
                    return (firstAuthorized || nextAgents[0]).agentAddress;
                });
            } else {
                setActiveAgentAddress("");
            }
            return nextAgents;
        } catch {
            setAgents([]);
            setActiveAgentAddress("");
            return [];
        }
    }, [smartAccountAddress, chainId]);

    // Load agent status on mount or when account changes
    useEffect(() => {
        void refreshAgents();
    }, [refreshAgents]);

    const generateAgent = async (scope, maxAmount, name = "") => {
        const res = await axios.post(`${CHATBOT_API_URL}/api/agent/generate`, {
            smartAccountAddress,
            ownerEoa: eoaAddress,
            chainId: chainId ? chainId.toString() : String(getDefaultChainId()),
            scope,
            maxAmount,
            name
        });
        upsertAgent(res.data);
        return res.data.agentAddress;
    };

    const authorizeAgent = async (agent) => {
        if (!smartAccountAddress || !agent?.agentAddress) return;
        const res = await axios.patch(`${CHATBOT_API_URL}/api/agent/${smartAccountAddress}/${agent.agentAddress}/authorize`, {
            chainId: chainId ? chainId.toString() : String(getDefaultChainId()),
            target: agent.target,
            selector: agent.selector,
            maxValueWei: agent.maxValueWei,
            validAfter: agent.validAfter,
            validUntil: agent.validUntil,
            txHashInstall: agent.txHashInstall
        });
        if (res.data.agent) {
            upsertAgent(res.data.agent, true);
        } else {
            upsertAgent({ ...agent, authorized: true }, true);
        }
        // Ensure we have the absolute latest state from the backend
        await refreshAgents();
    };

    const deleteAgent = async (agentAddress, { txHashRevoke } = {}) => {
        if (!smartAccountAddress || !agentAddress) return;
        await axios.patch(`${CHATBOT_API_URL}/api/agent/${smartAccountAddress}/${agentAddress}/revoke`, {
            chainId: chainId ? chainId.toString() : String(getDefaultChainId()),
            txHashRevoke
        });
        // Completely refresh agents from the backend to guarantee accurate state
        await refreshAgents();
    };

    const clearAgents = async ({ txHashRevoke } = {}) => {
        if (!smartAccountAddress) return;
        try {
            const activeChainId = chainId ? chainId.toString() : String(getDefaultChainId());
            const suffix = txHashRevoke ? `&txHashRevoke=${txHashRevoke}` : "";
            await axios.delete(`${CHATBOT_API_URL}/api/agent/${smartAccountAddress}?chainId=${activeChainId}${suffix}`);
        } finally {
            setAgents([]);
            setActiveAgentAddress("");
            setMessagesByAgent({});
        }
    };

    const sendMessage = async (messageText) => {
        if (!messageText.trim()) return;
        if (!activeAgentAddress) {
            setMessagesByAgent((prev) => ({
                ...prev,
                unassigned: [{ role: "agent", content: "Select or authorize an agent before sending a message." }]
            }));
            return;
        }

        const agentCanChat = Boolean(activeAgent)
            && activeAgent.authorized !== false
            && activeAgent?.status !== "revoked"
            && activeAgent?.status !== "expired"
            && !activeAgent?.revoked;
        if (!agentCanChat) {
            setAgentMessages(activeAgentAddress, (prev) => [
                ...prev,
                { role: "agent", content: "This agent is not active on-chain. Sync agents or create a new one before sending a message." }
            ]);
            return;
        }

        const userMsg = { role: "user", content: messageText };
        setAgentMessages(activeAgentAddress, (prev) => [...prev, userMsg]);
        setIsChatLoading(true);

        try {
            const res = await axios.post(`${CHATBOT_API_URL}/api/chat`, {
                message: messageText,
                smartAccountAddress,
                agentAddress: activeAgentAddress,
                chainId: chainId ? chainId.toString() : String(getDefaultChainId())
            });
            
            const aiMsg = { 
                role: "agent", 
                content: res.data.reply,
                ops: res.data.ops || []
            };

            (res.data.ops || []).forEach((op) => {
                if (op.opHash) {
                    const agentName = activeAgent?.name || "AI Agent";
                    trackOp(op.opHash, `${agentName} Operation ${op.iteration || ""}`.trim());
                }
            });
            
            setAgentMessages(activeAgentAddress, (prev) => [...prev, aiMsg]);
        } catch (e) {
            console.error("Agent chat request failed:", e);
            setAgentMessages(activeAgentAddress, (prev) => [...prev, {
                role: "agent",
                content: getFriendlyErrorMessage(e, "Sorry, I could not complete that request. Please try again.")
            }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const clearMessages = (agentAddress = activeAgentAddress) => {
        if (!agentAddress) {
            setMessagesByAgent({});
            return;
        }
        setAgentMessages(agentAddress, []);
    };

    const setAgentStatusCompat = (nextAgent) => {
        if (!nextAgent) {
            setActiveAgentAddress("");
            return;
        }
        authorizeAgent(nextAgent);
    };

    return (
        <ChatbotContext.Provider value={{
            agents,
            activeAgent,
            activeAgentAddress,
            setActiveAgentAddress,
            messagesByAgent,
            messages,
            sendMessage,
            clearMessages,
            isAgentConfigured,
            agentStatus,
            generateAgent,
            authorizeAgent,
            deleteAgent,
            clearAgents,
            refreshAgents,
            isChatLoading,
            setIsAgentConfigured: () => {}, // Backward-compatible no-op while ChatbotView migrates.
            setAgentStatus: setAgentStatusCompat
        }}>
            {children}
        </ChatbotContext.Provider>
    );
};
