import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useAppContext } from "./AppContext";
import { getDefaultChainId } from "../config/chains";

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

    // Load agent status on mount or when account changes
    useEffect(() => {
        const checkStatus = async () => {
            if (!smartAccountAddress) {
                setAgents([]);
                setActiveAgentAddress("");
                setMessagesByAgent({});
                return;
            }
            try {
                const activeChainId = chainId ? chainId.toString() : String(getDefaultChainId());
                const res = await axios.get(`${CHATBOT_API_URL}/api/agent/status/${smartAccountAddress}?chainId=${activeChainId}`);
                const nextAgents = Array.isArray(res.data.agents)
                    ? res.data.agents
                    : res.data.configured
                        ? [{
                            agentAddress: res.data.agentAddress,
                            scope: res.data.scope,
                            maxAmount: res.data.maxAmount,
                            authorized: true
                        }]
                        : [];

                setAgents(nextAgents);
                if (nextAgents.length > 0) {
                    setActiveAgentAddress((current) => {
                        const stillExists = nextAgents.some((agent) => normalizeAddress(agent.agentAddress) === normalizeAddress(current));
                        if (stillExists) return current;
                        const firstAuthorized = nextAgents.find((agent) => agent.authorized !== false);
                        return (firstAuthorized || nextAgents[0]).agentAddress;
                    });
                } else {
                    setActiveAgentAddress("");
                }
            } catch (e) {
                console.error("Failed to check agent status:", e);
                setAgents([]);
                setActiveAgentAddress("");
            }
        };
        checkStatus();
    }, [smartAccountAddress, chainId]);

    const generateAgent = async (scope, maxAmount, name = "") => {
        try {
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
        } catch (e) {
            console.error("Failed to generate agent:", e);
            throw e;
        }
    };

    const authorizeAgent = async (agent) => {
        if (!smartAccountAddress || !agent?.agentAddress) return;
        try {
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
            if (Array.isArray(res.data.agents)) {
                setAgents(res.data.agents);
            }
        } catch (e) {
            console.error("Failed to mark agent authorized:", e);
            throw e;
        }
    };

    const deleteAgent = async (agentAddress, { txHashRevoke } = {}) => {
        if (!smartAccountAddress || !agentAddress) return;
        const key = normalizeAddress(agentAddress);
        try {
            const res = await axios.patch(`${CHATBOT_API_URL}/api/agent/${smartAccountAddress}/${agentAddress}/revoke`, {
                chainId: chainId ? chainId.toString() : String(getDefaultChainId()),
                txHashRevoke
            });
            const nextAgents = Array.isArray(res.data.agents)
                ? res.data.agents
                : agents.filter((agent) => normalizeAddress(agent.agentAddress) !== key);
            setAgents(nextAgents);
            setMessagesByAgent((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setActiveAgentAddress((current) => {
                if (normalizeAddress(current) !== key) return current;
                const firstAuthorized = nextAgents.find((agent) => agent.authorized !== false);
                return (firstAuthorized || nextAgents[0])?.agentAddress || "";
            });
        } catch (e) {
            console.error("Failed to delete agent:", e);
            throw e;
        }
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
            console.error("Chat error:", e);
            setAgentMessages(activeAgentAddress, (prev) => [...prev, { role: "agent", content: "Sorry, I encountered an error: " + (e.response?.data?.error || e.message) }]);
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
            isChatLoading,
            setIsAgentConfigured: () => {}, // Backward-compatible no-op while ChatbotView migrates.
            setAgentStatus: setAgentStatusCompat
        }}>
            {children}
        </ChatbotContext.Provider>
    );
};
