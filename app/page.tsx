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

const conditionId = "1";
const QUALTRICS_RETURN_URL = "https://iu.co1.qualtrics.com/jfe/form/SV_2tvhb3IQU4w77Om";

type Message = { sender: "user" | "bot"; text: string };
type TimerHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;

export default function Home() {
  const [current, setCurrent] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [experimentStartTime, setExperimentStartTime] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrectSelection, setIsCorrectSelection] = useState<boolean | null>(null);
  const [started, setStarted] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [showCover, setShowCover] = useState(true);
  const [showStartButton, setShowStartButton] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");

  const [participantId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem("participant_id");
    if (saved) return saved;

    const id = crypto.randomUUID();
    window.localStorage.setItem("participant_id", id);
    return id;
  });

  const countdownRef = useRef<TimerHandle>(null);
  const advanceRef = useRef<TimerHandle>(null);

  const questionLockedRef = useRef(false);

  const wrongAnswerCountRef = useRef(0);
  const pendingWrongPromptQuestionRef = useRef<number | null>(null);

  const hasManuallyOpenedAssistantRef = useRef(false);
  const autoHelpPromptShownRef = useRef(false);

  useEffect(() => {
    if (!started || current >= questions.length) return;
    if (!experimentStartTime) return;

    const interval = setInterval(() => {
      setTotalTime(Math.floor((Date.now() - experimentStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [started, experimentStartTime, current]);

  useEffect(() => {
    if (!started) return;
    if (current >= questions.length) return;

    const shouldShowAutoPrompt =
      pendingWrongPromptQuestionRef.current === current && !autoHelpPromptShownRef.current;

    if (shouldShowAutoPrompt) {
      autoHelpPromptShownRef.current = true;
      pendingWrongPromptQuestionRef.current = null;

      setShowChat(true);
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: hasManuallyOpenedAssistantRef.current ? shortHelpPromptText : originalHelpPromptText,
        },
      ]);
    }
  }, [current, started]);

  useEffect(() => {
    if (!started) return;
    if (current >= questions.length) return;

    if (countdownRef.current) clearInterval(countdownRef.current as ReturnType<typeof setInterval>);
    if (advanceRef.current) clearTimeout(advanceRef.current as ReturnType<typeof setTimeout>);

    setTimeLeft(30);
    questionLockedRef.current = false;
    setSelectedIndex(null);
    setIsCorrectSelection(null);

    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!questionLockedRef.current) {
            questionLockedRef.current = true;

            if (countdownRef.current) {
              clearInterval(countdownRef.current as ReturnType<typeof setInterval>);
              countdownRef.current = null;
            }

            if (advanceRef.current) {
              clearTimeout(advanceRef.current as ReturnType<typeof setTimeout>);
            }

            advanceRef.current = setTimeout(() => {
              setCurrent((prevQ) => (prevQ >= questions.length - 1 ? questions.length : prevQ + 1));
            }, 0);
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current as ReturnType<typeof setInterval>);
        countdownRef.current = null;
      }
      if (advanceRef.current) {
        clearTimeout(advanceRef.current as ReturnType<typeof setTimeout>);
        advanceRef.current = null;
      }
    };
  }, [current, started]);

  useEffect(() => {
    if (!started) return;
    if (current < questions.length) return;

    const timer = setTimeout(() => {
      goBackToQuestionnaire();
    }, 2000);

    return () => clearTimeout(timer);
  }, [current, started, participantId]);

  function generateOptions(id: number) {
    return Array.from({ length: 6 }, (_, i) => `/images/q${id}_a${i + 1}.png`);
  }

  function goNextQuestion(delayMs: number) {
    if (questionLockedRef.current) return;
    questionLockedRef.current = true;

    if (countdownRef.current) {
      clearInterval(countdownRef.current as ReturnType<typeof setInterval>);
      countdownRef.current = null;
    }
    if (advanceRef.current) {
      clearTimeout(advanceRef.current as ReturnType<typeof setTimeout>);
      advanceRef.current = null;
    }

    advanceRef.current = setTimeout(() => {
      setSelectedIndex(null);
      setIsCorrectSelection(null);
      setCurrent((prev) => prev + 1);
    }, delayMs);
  }

  function handleAnswer(index: number) {
    if (!started) return;
    if (current >= questions.length) return;
    if (questionLockedRef.current) return;
    if (selectedIndex !== null) return;

    const isCorrect = index === questions[current].correct;

    setSelectedIndex(index);
    setIsCorrectSelection(isCorrect);

    if (isCorrect) {
      setScore((prev) => prev + 1);
    } else {
      wrongAnswerCountRef.current += 1;

      if (wrongAnswerCountRef.current === 2) {
        pendingWrongPromptQuestionRef.current = current + 1;
      }
    }

    goNextQuestion(1500);
  }

  function parseQuestionNumber(message: string): number | null {
    const text = message.toLowerCase();

    const ordinalWordMap: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
      eleventh: 11,
      twelfth: 12,
      thirteenth: 13,
      fourteenth: 14,
    };

    const ordinalNumberMatch = text.match(/\b(\d+)(st|nd|rd|th)\b/);
    if (ordinalNumberMatch) {
      return parseInt(ordinalNumberMatch[1], 10);
    }

    const digitMatch = text.match(/\d+/);
    if (digitMatch) {
      return parseInt(digitMatch[0], 10);
    }

    for (const [word, num] of Object.entries(ordinalWordMap)) {
      if (text.includes(word)) {
        return num;
      }
    }

    return null;
  }

  function generateReply(message: string) {
    const questionNumber = parseQuestionNumber(message);

    if (questionNumber) {
      const question = questions.find((q) => q.id === questionNumber);

      if (!question) return "I couldn't find that question number.";

      const correctIndex = question.correct;
      const allIndices = [0, 1, 2, 3, 4, 5];
      const wrongIndices = allIndices.filter((i) => i !== correctIndex);

      for (let i = wrongIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
      }

      const picked = wrongIndices.slice(0, 2);
      const letters = picked.map((i) => String.fromCharCode(65 + i));

      const responses = [
        `It is not option ${letters[0]} or ${letters[1]}.`,
        `You can eliminate ${letters[0]} and ${letters[1]}.`,
        `${letters[0]} and ${letters[1]} are definitely incorrect.`,
        `Try avoiding ${letters[0]} and ${letters[1]}.`,
        `I would rule out ${letters[0]} and ${letters[1]}.`,
      ];

      return responses[Math.floor(Math.random() * responses.length)];
    }

    return "Type a question number (e.g., 1, q1, 1st, or first) to get help.";
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = { sender: "user", text };
    const botReply: Message = { sender: "bot", text: generateReply(text) };

    setMessages((prev) => [...prev, userMessage, botReply]);
    setInput("");
  }

  function goBackToQuestionnaire() {
    if (typeof window === "undefined") return;

    window.location.href =
      `${QUALTRICS_RETURN_URL}` +
      `?participant_id=${encodeURIComponent(participantId)}` +
      `&condition_id=${encodeURIComponent(conditionId)}`;
  }

  if (showCover) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-4xl font-bold mb-8">Pattern Reasoning Challenge</h1>

          <button
            onClick={() => {
              setShowCover(false);
              setShowStartButton(false);

              setTimeout(() => {
                setShowStartButton(true);
              }, 4000);
            }}
            className="px-10 py-4 border border-cyan-400 text-cyan-400 rounded-2xl hover:bg-cyan-400 hover:text-black transition"
          >
            BEGIN
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="bg-black/70 backdrop-blur-xl border border-cyan-400 text-white rounded-3xl shadow-[0_0_40px_rgba(0,255,255,0.2)] max-w-2xl p-12 text-center">
          <div className="text-center">
            <div className="text-4xl font-bold mb-4">
              <p>RULES</p>
            </div>

            <div className="mt-6 space-y-2 text-lg text-white text-left pl-6">
              <p>
                There will be 14 matrix reasoning problems. You will have 30 seconds for each question.
                Each correct answer is worth 1 point.
              </p>
              <p>
                The upper left corner shows the question number. The upper right corner shows the countdown
                timer and your score. An ASSISTANT button is available in the lower left corner. You are
                encouraged to use the assistant if you need help with a question.
              </p>
              <p>
                A green check mark indicates a correct answer, and a red cross mark indicates an incorrect
                answer. The AI agent’s responses and feedback are shown on the same screen.
              </p>
              <p>Please solve as many problems as you can.</p>
            </div>
          </div>

          <div className="flex flex-col items-center mt-6">
            {!showStartButton && <p className="text-gray-500 animate-pulse mb-4">Preparing challenge...</p>}
            {showStartButton && (
              <button
                onClick={() => {
                  hasManuallyOpenedAssistantRef.current = false;
                  autoHelpPromptShownRef.current = false;
                  pendingWrongPromptQuestionRef.current = null;
                  wrongAnswerCountRef.current = 0;

                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("participant_id", participantId);
                  }

                  setMessages([]);
                  setInput("");
                  setShowChat(false);

                  setStarted(true);
                  setExperimentStartTime(Date.now());
                }}
                className="px-10 py-4 bg-black/80 backdrop-blur-md text-cyan-400 rounded-2xl border border-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.3)] tracking-widest text-lg hover:bg-cyan-400 hover:text-black transition-all duration-300"
              >
                READY!
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (current >= questions.length) {
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;

    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="bg-black/70 backdrop-blur-xl border border-cyan-400 text-white rounded-3xl shadow-[0_0_40px_rgba(0,255,255,0.2)] max-w-xl px-16 py-14 text-center">
          <h1 className="text-3xl font-semibold mb-6 tracking-wide">Experiment completed.</h1>
          <p className="text-lg text-gray-400 mt-4">
            Total time: <span className="text-cyan-400 font-semibold">
              {minutes}m {seconds}s
            </span>
          </p>
          <p className="text-xl text-gray-300">
            Your score: <span className="text-cyan-400 font-semibold">{score}</span>
          </p>

          <button
            onClick={goBackToQuestionnaire}
            className="mt-8 px-8 py-3 rounded-2xl bg-white text-black font-medium hover:bg-gray-200 transition"
          >
            Back to Questionnaire
          </button>
        </div>
      </div>
    );
  }

  const question = questions[current];
  const wrongCount = current - score;

  return (
    <div className="h-screen flex flex-col items-center justify-center relative">
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-cyan-400">
        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">QUESTION</p>
          <p className="text-2xl font-bold">
            {current + 1}
            <span className="text-sm text-gray-300 ml-2">/ {questions.length}</span>
          </p>
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex gap-8 items-center border border-cyan-400">
        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">WRONG</p>
          <p className="text-2xl font-bold text-red-400">{Math.max(0, wrongCount)}</p>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">SCORE</p>
          <p className="text-2xl font-bold text-green-400">{score}</p>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-widest text-cyan-400">TIME</p>
          <p className={`text-2xl font-bold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}`}>
            {timeLeft}s
          </p>
        </div>
      </div>

      <img src={`/images/q${question.id}.png`} alt="question" className="mb-6 max-w-xl" />

      <div className="grid grid-cols-6 gap-6">
        {generateOptions(question.id).map((option, index) => (
          <div key={index} className="relative">
            <img
              src={option}
              alt="option"
              onClick={() => handleAnswer(index)}
              className={`w-24 h-24 object-contain transition ${
                selectedIndex === index ? "ring-4 ring-cyan-400 scale-110" : "cursor-pointer hover:scale-105"
              }`}
            />

            {selectedIndex === index && isCorrectSelection === true && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-green-500 text-6xl font-bold drop-shadow-lg">✓</span>
              </div>
            )}

            {selectedIndex === index && isCorrectSelection === false && (
              <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center rounded">
                <span className="text-red-600 text-7xl font-bold drop-shadow-lg">✕</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setShowChat(true);

          if (!hasManuallyOpenedAssistantRef.current && !autoHelpPromptShownRef.current) {
            hasManuallyOpenedAssistantRef.current = true;

            setMessages((prev) => [
              ...prev,
              {
                sender: "bot",
                text: originalHelpPromptText,
              },
            ]);
          }
        }}
        className="fixed bottom-6 left-6 bg-black/80 backdrop-blur-md text-cyan-400 px-6 py-3 rounded-2xl border border-cyan-400 shadow-2xl tracking-widest text-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
      >
        ASSISTANT
      </button>

      {showChat && (
        <div className="fixed bottom-24 left-8 w-[480px] h-[560px] bg-white shadow-2xl rounded-3xl border border-gray-200 flex flex-col">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <p className="text-xs tracking-widest text-black">ASSISTANT</p>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-black text-sm">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-end gap-2 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "bot" && <img src="/images/bot.png" alt="bot" className="w-8 h-8 rounded-full" />}

                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm whitespace-pre-line ${
                    msg.sender === "user" ? "bg-black text-white" : "bg-white text-black border border-black"
                  }`}
                >
                  {msg.text}
                </div>

                {msg.sender === "user" && <img src="/images/user.png" alt="user" className="w-8 h-8 rounded-full" />}
              </div>
            ))}
          </div>

          <div className="border-t px-5 py-4 flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Ask about a question..."
            />
            <button
              onClick={sendMessage}
              className="px-5 bg-gray-900 text-white rounded-xl text-sm hover:bg-black transition"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
