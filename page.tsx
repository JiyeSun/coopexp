"use client";
import { useState, useEffect } from "react";

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
  { id: 14, correct: 1 }
];

export default function Home() {
  const [current, setCurrent] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [experimentStartTime, setExperimentStartTime] = useState<number | null>(null);
  const [started, setStarted] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [messages, setMessages] = useState<
    { sender: string; text: string }[]
  >([]);
  const [input, setInput] = useState<string>("");

  useEffect(() => {
  if (!started || current >= questions.length) return;

  const interval = setInterval(() => {
    if (experimentStartTime) {
      setTotalTime(Math.floor((Date.now() - experimentStartTime) / 1000));
    }
  }, 1000);

  return () => clearInterval(interval);
}, [started, experimentStartTime, current]);

  useEffect(() => {
  if (!started) return;

  setTimeLeft(30);

  const timer = setInterval(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        clearInterval(timer);

        if (current >= questions.length - 1) {
          setCurrent(questions.length);
        } else {
          setCurrent((prevQ) => prevQ + 1);
        }

        return 30;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [current, started]);

  function generateOptions(id: number) {
    return Array.from({ length: 6 }, (_, i) => 
      `/images/q${id}_a${i + 1}.png`
    );
  }

  function handleAnswer(index: number) {
    if (index === questions[current].correct) {
      setScore(score + 1);
    }
    setCurrent(current + 1);
  }

  function sendMessage() {
    if (!input.trim()) return;

    const userMessage = { sender: "user", text: input };

    const botReply = {
      sender: "bot",
      text: generateReply(input),
    };

    setMessages([...messages, userMessage, botReply]);
    setInput("");
  }

  function generateReply(message: string) {
  const lower = message.toLowerCase();
  const match = lower.match(/question\s*(\d+)/);

  if (lower.includes("help") && match) {
    const questionNumber = parseInt(match[1], 10);

    const question = questions.find(q => q.id === questionNumber);

    if (!question) {
      return "I couldn't find that question number.";
    }
    const letter = String.fromCharCode(65 + question.correct);
    return `The correct answer for question ${questionNumber} is option ${letter}.`;
  }

  return "Please type: Help me on question X 😊";
}

  if (!started) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">

        <div className="
          bg-black/70 backdrop-blur-xl
          border border-cyan-400
          text-white
          rounded-3xl
          shadow-[0_0_40px_rgba(0,255,255,0.2)]
          max-w-2xl
          p-12
          text-center
        ">

          {/* System Label */}
          {/* Title */}
          <h1 className="text-2xl md:text-2xl font-semibold mb-6 leading-relaxed max-w-2xl mx-auto">
            This is a performance test, try to complete as many matrices as possible in the shortest time. 
            Your performance will be compared to the other participants.
          </h1>

          {/* Description */}
          <p className="text-gray-300 leading-relaxed mb-8 text-lg max-w-xl mx-auto">
            You can click the <span className="text-cyan-400 font-medium">ASSISTANT </span> 
            button to ask the bot about any question you are stuck on. Click the button below to begin.
          </p>

          {/* Begin Button */}
          <button
            onClick={() => {
              setStarted(true);
              setExperimentStartTime(Date.now());
            }}
            className="
              px-10 py-4
              bg-black/80 backdrop-blur-md
              text-cyan-400
              rounded-2xl
              border border-cyan-400
              shadow-[0_0_20px_rgba(0,255,255,0.3)]
              tracking-widest
              text-lg
              hover:bg-cyan-400 hover:text-black
              hover:shadow-[0_0_25px_rgba(0,255,255,0.8)]
              hover:scale-105 active:scale-95
              transition-all duration-300
            "
          >
            BEGIN
          </button>

        </div>

      </div>
    );
  }

  if (current >= questions.length) {

    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    const formattedSeconds = seconds.toString().padStart(2, "0");

    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">

        <div className="
          bg-black/70 backdrop-blur-xl
          border border-cyan-400
          text-white
          rounded-3xl
          shadow-[0_0_40px_rgba(0,255,255,0.2)]
          max-w-xl
          px-16 py-14
          text-center
        ">

          {/* System Label */}
          <h1 className="text-3xl font-semibold mb-6 tracking-wide">
            Experiment completed.
          </h1>
          <p className="text-lg text-gray-400 mt-4">
            Total time: <span className="text-cyan-400 font-semibold">
              {minutes}m {seconds}s
            </span>
          </p>
          <p className="text-xl text-gray-300">
            Your score: <span className="text-cyan-400 font-semibold">{score}</span>
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center relative">
  
  {/* QUESTION HUD */}
  <div className="absolute top-4 left-4 
    bg-black/80 backdrop-blur-md 
    text-white px-6 py-3 
    rounded-2xl shadow-2xl 
    border border-cyan-400">

    <div className="text-center">
      <p className="text-xs tracking-widest text-cyan-400">
        QUESTION
      </p>
      <p className="text-2xl font-bold">
        {current + 1}
        <span className="text-sm text-gray-300 ml-2">
          / {questions.length}
        </span>
      </p>
    </div>

  </div>


  {/* Game Scoreboard */}
  <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md 
    text-white px-6 py-3 rounded-2xl shadow-2xl 
    flex gap-8 items-center border border-cyan-400">

    {/* WRONG */}
    <div className="text-center">
      <p className="text-xs tracking-widest text-cyan-400">WRONG</p>
      <p className="text-2xl font-bold text-red-400">{current-score}</p>
    </div>

    {/* SCORE */}
    <div className="text-center">
      <p className="text-xs tracking-widest text-cyan-400">SCORE</p>
      <p className="text-2xl font-bold text-green-400">{score}</p>
    </div>

    {/* TIME */}
    <div className="text-center">
      <p className="text-xs tracking-widest text-cyan-400">TIME</p>
      <p className={`text-2xl font-bold ${
        timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"
      }`}>
        {timeLeft}s
      </p>
    </div>

    {/* DONE */}
    <div className="text-center">
      <p className="text-xs tracking-widest text-cyan-400">DONE</p>
      <p className="text-2xl font-bold">{current}</p>
    </div>

</div>
      <img
        src={`/images/q${questions[current].id}.png`}
        alt="question"
        className="mb-6 max-w-xl"
      />

      <div className="grid grid-cols-6 gap-6">
        {generateOptions(questions[current].id).map((option, index) => (
          <img
            key={index}
            src={option}
            alt="option"
            onClick={() => handleAnswer(index)}
            className="w-24 h-24 object-contain cursor-pointer hover:scale-105 transition"
          />
        ))}
      </div>
      {/* Chat button */}

<button
  onClick={() => {
    if (!showChat && messages.length === 0) {
      setMessages([
        {
          sender: "bot",
          text: "Hello, if you need help solving a question, just ask me. Tell me which question you are struggling with and let's solve it together. I can help you with up to 10 questions. For example, you can ask: 'Help me on Question 1.'",
        },
      ]);
    }
    setShowChat(!showChat);
  }}
  className="
    fixed bottom-6 left-6
    bg-black/80 backdrop-blur-md
    text-cyan-400
    px-6 py-3
    rounded-2xl
    border border-cyan-400
    shadow-2xl
    tracking-widest text-sm
    hover:bg-cyan-400 hover:text-black
    transition-all duration-300
  "
>
  ASSISTANT
</button>

{/* Chat box */}
{showChat && (
  <div className="fixed bottom-24 left-8 w-[480px] h-[560px] bg-white shadow-2xl rounded-3xl border border-gray-200 flex flex-col">

    {/* Header */}
    <div className="px-6 py-4 border-b flex justify-between items-center">
      <div>
        <p className="text-xs tracking-widest text-gray-400">
          ASSISTANT
        </p>
      </div>

      <button
        onClick={() => setShowChat(false)}
        className="text-gray-400 hover:text-black text-sm"
      >
        ✕
      </button>
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {messages.map((msg, index) => (
        <div
          key={index}
          className={`flex items-end gap-2 ${
            msg.sender === "user"
              ? "justify-end"
              : "justify-start"
          }`}
        >
          {/* Bot Avatar */}
          {msg.sender === "bot" && (
            <img
              src="/images/bot.png"
              alt="bot"
              className="w-8 h-8 rounded-full"
            />
          )}

          {/* Message Bubble */}
          <div
            className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
              msg.sender === "user"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {msg.text}
          </div>

          {/* User Avatar */}
          {msg.sender === "user" && (
            <img
              src="/images/user.png"
              alt="user"
              className="w-8 h-8 rounded-full"
            />
          )}
        </div>
      ))}
    </div>

    {/* Input */}
    <div className="border-t px-5 py-4 flex gap-3">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
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


