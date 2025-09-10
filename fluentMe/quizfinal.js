/* quiz.js
   In-browser pipeline:
   - MediaRecorder + AudioContext for audio capture and VAD
   - SpeechRecognition (Web Speech API) for transcript (if available)
   - Compute pauses, speaking time, WPM, stutter-like events (repeated tokens), WER against reference text
   - Compute a Fluency score and store results into localStorage
*/

document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "read";
  
    // question sets (same as before)
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
  
    const questions = questionSets[type] || questionSets.read;
    let currentIndex = 0;
  
    // DOM refs
    const quizTitle = document.getElementById("quizTitle");
    const instructionEl = document.getElementById("instruction");
    const sentenceEl = document.getElementById("sentence");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const pronounceBtn = document.getElementById("pronounceBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const transcriptText = document.getElementById("transcriptText");
    const resultsBox = document.getElementById("results");
    const rDuration = document.getElementById("rDuration");
    const rSpeak = document.getElementById("rSpeak");
    const rWords = document.getElementById("rWords");
    const rWpm = document.getElementById("rWpm");
    const rPauses = document.getElementById("rPauses");
    const rStutters = document.getElementById("rStutters");
    const rWer = document.getElementById("rWer");
    const rFluency = document.getElementById("rFluency");
    const nextBtn = document.getElementById("nextBtn");
  
    quizTitle.textContent = `${type.charAt(0).toUpperCase()+type.slice(1)} Practice`;
  
    function displayQuestion(i) {
      instructionEl.textContent = questions[i].instruction;
      sentenceEl.textContent = questions[i].text;
      transcriptText.textContent = "—";
      resultsBox.style.display = "none";
      downloadBtn.style.display = "none";
    }
    displayQuestion(currentIndex);
  
    function speakText(text) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      speechSynthesis.speak(u);
    }
    pronounceBtn.onclick = () => speakText(questions[currentIndex].text);
  
    // Audio capture + VAD variables
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    let audioUrl = null;
    let startTime = 0;
    let stopTime = 0;
  
    // Web Audio for VAD
    let audioContext, sourceNode, scriptNode, mediaStream;
    const vadWindowMs = 30; // window for RMS
    let rmsHistory = [];
    let voiceFrames = []; // {t, rms, voice:boolean}
    const silenceThreshold = 0.01; // tuned for typical mics; could be exposed to user
  
    // SpeechRecognition (transcription)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    let recognizer = null;
    let transcriptFinal = "";
  
    if (!SpeechRecognition) {
      // Not supported
      transcriptText.textContent = "Transcription unavailable in this browser. Use Chrome/Edge for best results.";
    } else {
      recognizer = new SpeechRecognition();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = 'en-US';
      recognizer.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const res = ev.results[i];
          if (res.isFinal) transcriptFinal += res[0].transcript + " ";
          else interim += res[0].transcript;
        }
        const display = (transcriptFinal + " " + interim).trim();
        transcriptText.textContent = display || "—";
      };
      recognizer.onerror = (e) => {
        console.warn("SpeechRecognition error", e);
      };
    }
  
    async function startCapture() {
      audioChunks = [];
      transcriptFinal = "";
      startTime = performance.now();
  
      // request stream
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.onstop = onRecordingStop;
      mediaRecorder.start();
  
      // audio context for VAD
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
  
      // use ScriptProcessor for simplicity (small buffer)
      const bufferSize = 2048;
      scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      sourceNode.connect(scriptNode);
      scriptNode.connect(audioContext.destination);
  
      scriptNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const now = audioContext.currentTime;
        // compute RMS
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        rmsHistory.push({ t: now, rms });
        // voice boolean
        const voice = rms >= silenceThreshold;
        voiceFrames.push({ t: (performance.now() - startTime) / 1000, rms, voice });
        // compact history if too big
        if (rmsHistory.length > 1000) rmsHistory.splice(0, 200);
      };
  
      // start recognition if available
      if (recognizer) {
        transcriptFinal = "";
        try { recognizer.start(); } catch (e) { /* may throw if already started */ }
      }
  
      startBtn.disabled = true;
      stopBtn.disabled = false;
    }
  
    function stopCapture() {
      stopTime = performance.now();
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
      if (scriptNode) { scriptNode.disconnect(); scriptNode.onaudioprocess = null; }
      if (sourceNode) sourceNode.disconnect();
      if (audioContext) audioContext.close();
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
  
      if (recognizer) {
        try { recognizer.stop(); } catch (e) { /* ignore */ }
      }
  
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  
    async function onRecordingStop() {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioUrl = URL.createObjectURL(audioBlob);
      downloadBtn.style.display = "inline-block";
      downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = audioUrl; a.download = `recording-${Date.now()}.webm`; a.click();
      };
  
      // Compute metrics
      const duration = ((stopTime || performance.now()) - startTime) / 1000; // seconds
      // speaking time from VAD
      const speakingMs = computeSpeakingTime(voiceFrames);
      const speakingTime = speakingMs / 1000;
      const transcript = (transcriptFinal || transcriptText.textContent || "").trim();
      const words = countWords(transcript);
      const wpm = speakingTime > 0 ? Math.round(words / (speakingTime / 60)) : 0;
  
      // pauses: identify silence segments longer than threshold
      const pauseStats = analyzePauses(voiceFrames);
      const pausesCount = pauseStats.count;
      const avgPause = pauseStats.avg; // seconds
  
      // stutter detection: repeated adjacent tokens + small prefix repeats
      const stutterEvents = detectStutterEvents(transcript);
      const stutterCount = stutterEvents.length;
      const percentSyllablesStuttered = words > 0 ? Math.round((stutterCount / Math.max(1, words)) * 100 * 10) / 10 : 0;
  
      // WER if reading (if reference available)
      const reference = questions[currentIndex].text || "";
      let wer = null;
      let accuracyPercent = null;
      if (reference && transcript) {
        wer = computeWER(reference, transcript);
        accuracyPercent = Math.max(0, Math.round((1 - wer) * 100));
      }
  
      // Fluency score: combine metrics
      const fluencyScore = computeFluencyScore({
        wpm, speakingTime, duration, pausesCount, avgPause, stutterCount, words
      });
  
      // Display results
      resultsBox.style.display = "block";
      rDuration.textContent = `${duration.toFixed(1)}s`;
      rSpeak.textContent = `${speakingTime.toFixed(1)}s`;
      rWords.textContent = `${words}`;
      rWpm.textContent = `${wpm}`;
      rPauses.textContent = `Pauses: ${pausesCount} (avg ${avgPause.toFixed(2)}s)`;
      rStutters.textContent = `Stutter-like events: ${stutterCount} (${percentSyllablesStuttered}%)`;
      rWer.textContent = wer === null ? "—" : `${(wer*100).toFixed(1)}% (WER)`;
      rFluency.textContent = `${fluencyScore} / 100`;
  
      // Save to localStorage
      saveResults(type, {
        durationSeconds: Math.round(duration),
        speakingSeconds: Math.round(speakingTime),
        words,
        wpm,
        pausesCount,
        avgPauseSeconds: avgPause,
        stutterCount,
        percentSyllablesStuttered,
        wer,
        fluencyScore,
        timestamp: Date.now()
      });
  
      // small visual: show transcript
      transcriptText.textContent = transcript || "—";
    }
  
    // Helpers ----------------------------------------------------
  
    function computeSpeakingTime(frames) {
      // frames array: {t (s), rms, voice boolean}
      if (!frames || frames.length === 0) return 0;
      // Count total voice frames time (approx)
      let frameDt = 0.03; // approx (depends on buffer)
      let voiceCount = frames.reduce((c, f) => c + (f.voice ? 1 : 0), 0);
      return voiceCount * frameDt * 1000; // ms
    }
  
    function analyzePauses(frames) {
      // find silence segments between voice segments; treat voice boolean
      if (!frames || frames.length === 0) return { count: 0, avg: 0 };
      const minPause = 0.25; // seconds: threshold for counting a pause
      let pauses = [];
      let inSilence = false;
      let silenceStart = 0;
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f.voice && !inSilence) {
          inSilence = true;
          silenceStart = f.t;
        } else if (f.voice && inSilence) {
          inSilence = false;
          const dur = f.t - silenceStart;
          if (dur >= minPause) pauses.push(dur);
        }
      }
      // if ended in silence
      if (inSilence) {
        const last = frames[frames.length-1];
        const dur = last.t - silenceStart;
        if (dur >= minPause) pauses.push(dur);
      }
      const avg = pauses.length ? pauses.reduce((a,b)=>a+b,0)/pauses.length : 0;
      return { count: pauses.length, avg };
    }
  
    function detectStutterEvents(transcript) {
      // crude but effective heuristics:
      // - repeated identical adjacent tokens: "the the"
      // - repeated single letters/short tokens: "b b ball"
      if (!transcript) return [];
      const text = transcript.replace(/[^\w\s']/g, " ").toLowerCase();
      const tokens = text.split(/\s+/).filter(Boolean);
      let events = [];
      for (let i = 1; i < tokens.length; i++) {
        // identical adjacents
        if (tokens[i] === tokens[i-1]) {
          events.push({ type: "repetition", token: tokens[i], index: i });
        } else {
          // prefix repeat: previous token is single-letter or repeated starting substring
          if (tokens[i-1].length <= 2 && tokens[i].startsWith(tokens[i-1])) {
            events.push({ type: "prefix_repeat", prev: tokens[i-1], token: tokens[i], index: i });
          }
          // repeated starting characters e.g., "b-b-ball" could be joined; check if token has doubled initial char
          if (tokens[i].length >= 3 && tokens[i][0] === tokens[i][1] && tokens[i][0] === tokens[i-2]?.[0]) {
            events.push({ type:"prolongation", token: tokens[i], index: i });
          }
        }
      }
      return events;
    }
  
    function countWords(text) {
      if (!text) return 0;
      return text.trim().split(/\s+/).filter(Boolean).length;
    }
  
    // Word Error Rate (word-level Levenshtein)
    function computeWER(ref, hyp) {
      const a = ref.toLowerCase().replace(/[^\w\s']/g," ").split(/\s+/).filter(Boolean);
      const b = hyp.toLowerCase().replace(/[^\w\s']/g," ").split(/\s+/).filter(Boolean);
      const n = a.length, m = b.length;
      if (n === 0) return m === 0 ? 0 : 1;
      // DP
      const dp = Array.from({length:n+1}, ()=>Array(m+1).fill(0));
      for (let i=0;i<=n;i++) dp[i][0]=i;
      for (let j=0;j<=m;j++) dp[0][j]=j;
      for (let i=1;i<=n;i++){
        for (let j=1;j<=m;j++){
          if (a[i-1]===b[j-1]) dp[i][j]=dp[i-1][j-1];
          else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
      }
      return dp[n][m] / n;
    }
  
    function computeFluencyScore({ wpm, speakingTime, duration, pausesCount, avgPause, stutterCount, words }) {
      // normalized components 0..1 where 1 is best
      const idealWpm = 150; // rough
      // wpm score: penalize big deviations
      const wpmScore = 1 - Math.min(1, Math.abs(wpm - idealWpm) / 150);
      // pause score: fewer pauses better
      const pauseScore = 1 - Math.min(1, (pausesCount * avgPause) / Math.max(0.5, speakingTime));
      // stutter score: fewer stutters better
      const stutterScore = 1 - Math.min(1, stutterCount / Math.max(1, words));
      // speaking ratio: prefer speaking time close to duration (little long silence)
      const speakingRatio = speakingTime / Math.max(0.1, duration);
      const speakingScore = Math.max(0, Math.min(1, speakingRatio));
      // weighted average
      const score = Math.round(
        ((wpmScore * 0.30) + (stutterScore * 0.35) + (pauseScore * 0.20) + (speakingScore * 0.15)) * 100
      );
      return Math.max(0, Math.min(100, score));
    }
  
    function saveResults(skillType, result) {
      // update per-skill scores (we use fluencyScore as the skill score)
      let scores = JSON.parse(localStorage.getItem("scores")) || { read:0, word:0, tongue:0, question:0, photo:0, numbers:0 };
      scores[skillType] = Math.round(result.fluencyScore);
      localStorage.setItem("scores", JSON.stringify(scores));
  
      // update overview
      const overview = JSON.parse(localStorage.getItem("overview") || "{}");
      overview.samples = (overview.samples || 0) + 1;
      overview.timeSpentSeconds = (overview.timeSpentSeconds || 0) + (result.durationSeconds || 0);
      // update rolling accuracy/fluency averages
      overview.accuracy = (overview.accuracy || 0) * (overview.samples - 1) / overview.samples + ((result.wer !== null ? Math.round((1-result.wer)*100) : 0) / overview.samples);
      overview.fluency = (overview.fluency || 0) * (overview.samples - 1) / overview.samples + (result.fluencyScore / overview.samples);
      overview.maxStutterLikelihood = Math.max(overview.maxStutterLikelihood || 0, (result.stutterCount / Math.max(1,result.words)) || 0);
      overview.streak = overview.streak || 0; // could be enhanced
      localStorage.setItem("overview", JSON.stringify(overview));
    }
  
    // Bind UI
    startBtn.onclick = () => startCapture();
    stopBtn.onclick = () => stopCapture();
  
    nextBtn.onclick = () => {
      // move to next or finish
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        displayQuestion(currentIndex);
      } else {
        // finished skill set -> show profile
        // slight delay to ensure results saved
        setTimeout(()=>{ window.location.href = "profile.html"; }, 300);
      }
    };
  
  });
  
