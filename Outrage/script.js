
(function(){
  // ランダム再生用制御変数
  let randomPlayActive = false;
  let randomPlayTimeout = null;

  function getAllPresetButtons() {
    return Array.from(document.querySelectorAll('.preset-btn'));
  }

  function playRandomButtonSequentially() {
    if (!randomPlayActive) return;
    const btns = getAllPresetButtons();
    if (!btns.length) return;
    // ランダムで1つ選ぶ
    const btn = btns[Math.floor(Math.random() * btns.length)];
    // 再生終了時に次を再生
    const onEnded = () => {
      if (!randomPlayActive) return;
      randomPlayTimeout = setTimeout(playRandomButtonSequentially, 500); // 0.5秒待って次
    };
    // 既存audioのonendedを上書き
    const origPlayFromUrl = playFromUrl;
    playFromUrl = function(src, label) {
      stopAudioFile();
      stopTTS();
      try{
        audio = new Audio(src);
        audio.onplay = () => setStatus('音声ファイル再生中 (' + (label || '') + ')');
        audio.onended = () => { setStatus('再生完了'); audio = null; onEnded(); };
        audio.onerror = () => setStatus('音声の再生に失敗しました');
        audio.play().catch(err => setStatus('再生エラー: ' + err.message));
      }catch(e){ setStatus('オーディオ再生エラー: ' + e.message); }
    };
    playForButton(btn);
    // playFromUrlを元に戻す
    playFromUrl = origPlayFromUrl;
  }

  function stopRandomPlay() {
    randomPlayActive = false;
    if (randomPlayTimeout) {
      clearTimeout(randomPlayTimeout);
      randomPlayTimeout = null;
    }
    stopAudioFile();
    stopTTS();
    setStatus('ランダム再生を停止しました');
  }
  // Per-button audio player with optional on-disk data-src support and TTS fallback
  const assignedMap = new Map(); // button -> {url, file}
  let audio = null;
  let utterance = null;
  const defaultText = '再生します。';

  function setStatus(msg) {
    console.log('[status]', msg);
  }

  function supportsTTS(){ return 'speechSynthesis' in window; }

  function playTTS(text){
    if (!supportsTTS()) { setStatus('ブラウザがTTSをサポートしていません'); return; }
    const t = text && text.trim() ? text.trim() : defaultText;
    utterance = new SpeechSynthesisUtterance(t);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.onstart = () => setStatus('TTS 再生中');
    utterance.onend = () => setStatus('再生完了');
    utterance.onerror = (e) => setStatus('TTS エラー: ' + (e.error || e.message || '不明'));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function stopTTS(){ if (supportsTTS()) window.speechSynthesis.cancel(); utterance = null; }

  function stopAudioFile(){
    if (audio){
      try{ audio.pause(); audio.currentTime = 0; }catch(e){}
      audio = null;
      setStatus('停止しました');
    }
  }

  function playFromUrl(src, label){
    stopAudioFile();
    stopTTS();
    try{
      audio = new Audio(src);
      audio.onplay = () => setStatus('音声ファイル再生中 (' + (label || '') + ')');
      audio.onended = () => { setStatus('再生完了'); audio = null; };
      audio.onerror = () => setStatus('音声の再生に失敗しました');
      audio.play().catch(err => setStatus('再生エラー: ' + err.message));
    }catch(e){ setStatus('オーディオ再生エラー: ' + e.message); }
  }

  function playForButton(btn){
    const assigned = assignedMap.get(btn);
    if (assigned && assigned.url){ playFromUrl(assigned.url, btn.title || ''); return; }
    if (btn.dataset && btn.dataset.srcList){
      // data-src-list: comma separated list of relative urls -> pick one at random
      const list = btn.dataset.srcList.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length){
        const choice = list[Math.floor(Math.random()*list.length)];
        playFromUrl(choice, btn.title || '');
        return;
      }
    }
    if (btn.dataset && btn.dataset.src){ playFromUrl(btn.dataset.src, btn.title || ''); return; }
    const phrase = btn.dataset.phrase || btn.textContent || '';
    if (phrase){ playTTS(phrase); return; }
    setStatus('再生する音声がありません');
  }

  function makePresetHandlers(btn){
    btn.addEventListener('click', () => playForButton(btn));

    ['dragenter','dragover'].forEach(ev => btn.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); btn.classList.add('dragover-btn'); }));
    ['dragleave','drop'].forEach(ev => btn.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); btn.classList.remove('dragover-btn'); }));

    btn.addEventListener('drop', (e)=>{
      const files = e.dataTransfer.files;
      if (!files || !files.length) return;
      const file = files[0];
      if (!file.type.startsWith('audio')){ setStatus('オーディオファイルをドロップしてください'); return; }
      const prev = assignedMap.get(btn);
      if (prev && prev.url) try{ URL.revokeObjectURL(prev.url); }catch(e){}
      const url = URL.createObjectURL(file);
      assignedMap.set(btn, {url, file});
      btn.classList.add('assigned');
      btn.title = 'ファイル割り当て済み: ' + file.name;
      setStatus('ファイルをボタンに割り当てました: ' + file.name);
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const presetBtns = Array.from(document.querySelectorAll('.preset-btn'));
    // add visible labels when buttons are empty: derive from title or filename
    presetBtns.forEach(btn => {
      if (!btn.textContent.trim()){
        const t = btn.title || '';
        let label = t.replace(/\.[^.]+$/, '').replace(/_/g,' ');
        // simple mapping for kajino -> カジノ
        label = label.replace(/^kajino(\d+)$/i, (m,p)=>`カジノ${p}`);
        // capitalize first letter if still ascii
        if (!label.match(/[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/)){
          label = label.replace(/(^|\s)([a-z])/g, (m,p,c)=>p + c.toUpperCase());
        }
        btn.textContent = label;
      }
    });
    presetBtns.forEach(makePresetHandlers);

    // group toggles: expand/collapse subgrids (dropdown overlay)
    const groupToggles = Array.from(document.querySelectorAll('.preset-group-toggle'));
    groupToggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = toggle.nextElementSibling;
        if (!sub) return;
        // close any other open subgrids
        document.querySelectorAll('.preset-subgrid').forEach(s => { if (s !== sub) s.classList.add('hidden'); });
        const isHidden = sub.classList.toggle('hidden');
        toggle.setAttribute('aria-expanded', (!isHidden).toString());
        setStatus((!isHidden ? 'グループを展開しました' : 'グループを折りたたみました'));
      });
    });

    // clicking outside any open subgrid closes them
    document.addEventListener('click', () => {
      document.querySelectorAll('.preset-subgrid').forEach(s => s.classList.add('hidden'));
      groupToggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    });
    // prevent clicks inside subgrid from closing when interacting
    document.querySelectorAll('.preset-subgrid').forEach(s => s.addEventListener('click', e => e.stopPropagation()));
    // ランダム再生ボタン
    const randomBtn = document.getElementById('randomPlayBtn');
    const stopBtn = document.getElementById('randomStopBtn');
    if (randomBtn && stopBtn) {
      randomBtn.addEventListener('click', () => {
        if (randomPlayActive) return;
        randomPlayActive = true;
        playRandomButtonSequentially();
        setStatus('ランダム再生を開始しました');
      });
      stopBtn.addEventListener('click', stopRandomPlay);
    }
    setStatus('準備完了');
  });

})();
// カテゴリごと順番再生用ユーティリティ
function createSequentialPlayer(categoryId, playBtnId, stopBtnId) {
    const playBtn = document.getElementById(playBtnId);
    const stopBtn = document.getElementById(stopBtnId);
    const container = document.getElementById(categoryId);
    let audios = [];
    let playingIndex = 0;
    let isPlaying = false;

    async function playNext() {
        if (!isPlaying || playingIndex >= audios.length) {
            isPlaying = false;
            return;
        }
        const src = audios[playingIndex].getAttribute('data-src');
        if (src) {
            const audio = new Audio(src);
            audio.addEventListener('ended', () => {
                playingIndex++;
                playNext();
            });
            audio.play();
            // 一度に1つしか鳴らさず、停止命令のためcurrentAudioを保持
            createSequentialPlayer.currentAudio = audio;
        } else {
            playingIndex++;
            playNext();
        }
    }

    playBtn.addEventListener('click', () => {
        // 複数回押した時のガード
        if (isPlaying) return;
        audios = Array.from(container.querySelectorAll('.preset-btn'));
        playingIndex = 0;
        isPlaying = true;
        playNext();
    });

    stopBtn.addEventListener('click', () => {
        isPlaying = false;
        if (createSequentialPlayer.currentAudio) {
            createSequentialPlayer.currentAudio.pause();
            createSequentialPlayer.currentAudio.currentTime = 0;
        }
        createSequentialPlayer.currentAudio = null;
    });
}

// それぞれのカテゴリで適用
createSequentialPlayer('outrage-category', 'outrage-seq-play', 'outrage-seq-stop');
createSequentialPlayer('beyond-category', 'beyond-seq-play', 'beyond-seq-stop');
createSequentialPlayer('final-category', 'final-seq-play', 'final-seq-stop');
