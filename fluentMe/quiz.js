document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");

  const questionSets = {
    read: [
      { instruction: "Read this aloud:", text: "The quick brown fox jumps over the lazy dog." },
      { instruction: "Read this aloud:", text: "Artificial intelligence is shaping the future." },
      { instruction: "Read this aloud:", text: "Learning never exhausts the mind." },
      { instruction: "Read this aloud:", text: "Consistency is the key to success." },
      { instruction: "Read this aloud:", text: "Knowledge speaks, but wisdom listens." }
    ],
    word: [
      { instruction: "Say this word:", text: "Innovation" },
      { instruction: "Say this word:", text: "Technology" },
      { instruction: "Say this word:", text: "Entrepreneurship" },
      { instruction: "Say this word:", text: "Creativity" },
      { instruction: "Say this word:", text: "Collaboration" }
    ],
    tongue: [
      { instruction: "Say this tongue twister quickly:", text: "She sells seashells by the seashore." },
      { instruction: "Say this tongue twister quickly:", text: "Peter Piper picked a peck of pickled peppers." },
      { instruction: "Say this tongue twister quickly:", text: "How much wood would a woodchuck chuck?" },
      { instruction: "Say this tongue twister quickly:", text: "Fuzzy Wuzzy was a bear, Fuzzy Wuzzy had no hair." },
      { instruction: "Say this tongue twister quickly:", text: "Red lorry, yellow lorry, red lorry, yellow lorry." }
    ],
    question: [
      { instruction: "Answer this question:", text: "What is your favorite hobby?" },
      { instruction: "Answer this question:", text: "Describe your morning routine." },
      { instruction: "Answer this question:", text: "What motivates you every day?" },
      { instruction: "Answer this question:", text: "How do you handle challenges?" },
      { instruction: "Answer this question:", text: "If you could travel anywhere, where would you go?" }
    ],
    photo: [
      { instruction: "Describe this photo:", text: "🖼️ Imagine a park with children playing." },
      { instruction: "Describe this photo:", text: "🖼️ Imagine a busy street market." },
      { instruction: "Describe this photo:", text: "🖼️ Imagine a mountain landscape at sunset." },
      { instruction: "Describe this photo:", text: "🖼️ Imagine a calm beach with waves crashing." },
      { instruction: "Describe this photo:", text: "🖼️ Imagine a bustling city skyline at night." }
    ],
    numbers: [
      { instruction: "Read these numbers aloud:", text: "One, two, three, four, five." },
      { instruction: "Read these numbers aloud:", text: "Ten, twenty, thirty, forty, fifty." },
      { instruction: "Read these numbers aloud:", text: "Hundred, two hundred, three hundred, four hundred, five hundred." },
      { instruction: "Read these numbers aloud:", text: "Eleven, twelve, thirteen, fourteen, fifteen." },
      { instruction: "Read these numbers aloud:", text: "Sixty, seventy, eighty, ninety, one hundred." }
    ]
  };

  let questions = questionSets[type];
  let currentIndex = 0;

  const quizTitle = document.getElementById("quizTitle");
  const instructionEl = document.getElementById("instruction");
  const sentenceEl = document.getElementById("sentence");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const audioPlayback = document.getElementById("audioPlayback");
  const nextBtn = document.getElementById("nextBtn");
  const pronounceBtn = document.getElementById("pronounceBtn");

  if (!questions || questions.length === 0) {
    quizTitle.textContent = "Invalid Assessment";
    instructionEl.textContent = "No questions found for this type.";
    sentenceEl.textContent = "Please go back and select a valid assessment.";
    startBtn.style.display = "none";
    stopBtn.style.display = "none";
    nextBtn.style.display = "none";
    pronounceBtn.style.display = "none";
    return;
  }

  quizTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1) + " Practice";

  function displayQuestion(index) {
    instructionEl.textContent = questions[index].instruction;
    sentenceEl.textContent = questions[index].text;
    audioPlayback.style.display = "none";
  }

  function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  }

  pronounceBtn.onclick = () => {
    speakText(questions[currentIndex].text);
  };

  displayQuestion(currentIndex);

  let mediaRecorder;
  let audioChunks = [];

  startBtn.onclick = async () => {
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    audioChunks = [];

    mediaRecorder.addEventListener("dataavailable", event => {
      audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks);
      const audioUrl = URL.createObjectURL(audioBlob);
      audioPlayback.style.display = "block";
      audioPlayback.src = audioUrl;
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  stopBtn.onclick = () => {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };

  nextBtn.onclick = () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      displayQuestion(currentIndex);
    } else {
      instructionEl.textContent = "Please wait...";
      sentenceEl.textContent = "Analyzing your speech...";
      startBtn.style.display = "none";
      stopBtn.style.display = "none";
      nextBtn.style.display = "none";
      pronounceBtn.style.display = "none";

      let scores = JSON.parse(localStorage.getItem("scores")) || {};
      scores[type] = Math.floor(Math.random() * 21) + 80;
      localStorage.setItem("scores", JSON.stringify(scores));

      setTimeout(() => {
        window.location.href = "profile.html";
      }, 2000);
    }
  };
});
