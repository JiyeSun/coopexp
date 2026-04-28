"use client";

import { useEffect, useRef, useState } from "react";

const questions = [
  { id: 1, correct: 0 },
  { id: 2, correct: 3 },
  { id: 3, correct: 4 },
  { id: 4, correct: 5 },
  { id: 5, correct: 3 },
  { id: 6, correct: 3 },
  { id: 7, correct: 0 },
  { id: 8, correct: 5 },
  { id: 9, correct: 5 },
  { id: 10, correct: 4 },
  { id: 11, correct: 2 },
  { id: 12, correct: 5 },
  { id: 13, correct: 3 },
  { id: 14, correct: 1 },
];

const originalHelpPromptText =
  "Do you want me to help you?\n\n" +
  "If you need help solving a question, just ask me. Tell me which question you are struggling with and let's solve it together. I can help you with up to 10 questions. For example, you can ask: 'Help me on Question 1.'";

const shortHelpPromptText = "Do you want me to help you? Tell me which question you are trying to solve.";

export default function Home() {
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [started, setStarted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ sender: "user" | "bot"; text: string }[]>([]);
  const [input, setInput] = useState("");

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 自动滚动
  useEffect(() => {
    if (showChat) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showChat]);

  function generateOptions(id: number) {
    return Array.from({ length: 6 }, (_, i) => `/images/q${id}_a${i + 1}.png`);
  }

  function handleAnswer(index: number) {
    if (!started) return;
    const isCorrect = index === questions[current].correct;

    if (isCorrect) {
      setScore((prev) => prev + 1);
    }

    setTimeout(() => {
      setCurrent((prev) => prev + 1);
    }, 800);
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const userMsg = { sender: "user" as const, text };
    const botMsg = { sender: "bot" as const, text: "Try eliminating two wrong options." };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
  }

  useEffect(() => {
    if (!started) return;

    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          setCurrent((c) => c + 1);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownRef.current!);
  }, [current, started]);

  if (!started) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <button onClick={() => setStarted(true)} className="px-6 py-3 border">
          START
        </button>
      </div>
    );
  }

  if (current >= questions.length) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div>
          <p>Score: {score}</p>
        </div>
      </div>
    );
  }

  const question = questions[current];

  return (
    <div className="h-screen flex flex-col items-center justify-center relative">
      <div className="absolute top-4 right-4 text-white">{timeLeft}s</div>

      <img src={`/images/q${question.id}.png`} className="mb-6 max-w-xl" />

      <div className="grid grid-cols-6 gap-4">
        {generateOptions(question.id).map((opt, i) => (
          <img
            key={i}
            src={opt}
            className="w-20 h-20 cursor-pointer"
            onClick={() => handleAnswer(i)}
          />
        ))}
      </div>

      <button
        onClick={() => {
          setShowChat(true);
          setMessages((prev) => [...prev, { sender: "bot", text: originalHelpPromptText }]);
        }}
        className="fixed bottom-6 left-6 bg-white px-4 py-2"
      >
        ASSISTANT
      </button>

      {showChat && (
        <div className="fixed bottom-24 left-6 w-96 h-[500px] bg-white flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.sender === "user" ? "text-right" : "text-left"}>
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="flex p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1 border"
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
