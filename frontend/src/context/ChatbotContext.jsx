import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { useAppContext } from "./AppContext";
import { getDefaultChainId } from "../config/chains";

const ChatbotContext = createContext();
const CHATBOT_API_URL = import.meta.env.VITE_CHATBOT_API_URL || "";

export const useChatbotContext = () => useContext(ChatbotContext);

export const ChatbotProvider = ({ children }) => {
    const { smartAccountAddress, chainId, trackOp } = useAppContext();
    const [messages, setMessages] = useState([]);
    const [isAgentConfigured, setIsAgentConfigured] = useState(false);
    const [agentStatus, setAgentStatus] = useState(null); // { agentAddress, scope, maxAmount }
    const [isChatLoading, setIsChatLoading] = useState(false);

    // Load agent status on mount or when account changes
    useEffect(() => {
        const checkStatus = async () => {
            if (!smartAccountAddress) {
                setIsAgentConfigured(false);
                setAgentStatus(null);
                return;
            }
            try {
                const res = await axios.get(`${CHATBOT_API_URL}/api/agent/status/${smartAccountAddress}`);
                if (res.data.configured) {
                    setIsAgentConfigured(true);
                    setAgentStatus({
                        agentAddress: res.data.agentAddress,
                        scope: res.data.scope,
                        maxAmount: res.data.maxAmount
                    });
                } else {
                    setIsAgentConfigured(false);
                    setAgentStatus(null);
                }
            } catch (e) {
                console.error("Failed to check agent status:", e);
                setIsAgentConfigured(false);
            }
        };
        checkStatus();
    }, [smartAccountAddress]);

    const generateAgent = async (scope, maxAmount) => {
        try {
            const res = await axios.post(`${CHATBOT_API_URL}/api/agent/generate`, {
                smartAccountAddress,
                scope,
                maxAmount
            });
            const { agentAddress } = res.data;
            return agentAddress;
        } catch (e) {
            console.error("Failed to generate agent:", e);
            throw e;
        }
    };

    const sendMessage = async (messageText) => {
        if (!messageText.trim()) return;

        const userMsg = { role: "user", content: messageText };
        setMessages((prev) => [...prev, userMsg]);
        setIsChatLoading(true);

        try {
            const res = await axios.post(`${CHATBOT_API_URL}/api/chat`, {
                message: messageText,
                smartAccountAddress,
                chainId: chainId ? chainId.toString() : String(getDefaultChainId())
            });
            
            const aiMsg = { 
                role: "agent", 
                content: res.data.reply,
                ops: res.data.ops || []
            };

            (res.data.ops || []).forEach((op) => {
                if (op.opHash) {
                    trackOp(op.opHash, `AI Agent Operation ${op.iteration || ""}`.trim());
                }
            });
            
            setMessages((prev) => [...prev, aiMsg]);
        } catch (e) {
            console.error("Chat error:", e);
            setMessages((prev) => [...prev, { role: "agent", content: "Sorry, I encountered an error: " + (e.response?.data?.error || e.message) }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const clearMessages = () => setMessages([]);

    return (
        <ChatbotContext.Provider value={{
            messages,
            sendMessage,
            clearMessages,
            isAgentConfigured,
            agentStatus,
            generateAgent,
            isChatLoading,
            setIsAgentConfigured, // To manually set after setup is complete
            setAgentStatus
        }}>
            {children}
        </ChatbotContext.Provider>
    );
};
