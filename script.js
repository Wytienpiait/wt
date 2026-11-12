'use strict';

// ===== Navigation and scroll animations =====
const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const navLinks = [...document.querySelectorAll('.nav-link')];
const sections = [...document.querySelectorAll('main section[id]')];

function updateHeader() { header.classList.toggle('scrolled', window.scrollY > 24); }
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

function closeMenu() {
  nav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Mở menu');
}
menuToggle.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Đóng menu' : 'Mở menu');
});
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => closeMenu()));
window.addEventListener('resize', () => { if (window.innerWidth > 760) closeMenu(); });

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach(section => navObserver.observe(section));
} else {
  document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('revealed'));
}

// ===== Original song lists, preserved from the previous website =====
const songData = {
  classical: [
    'Für Elise - Beethoven',
    'Moonlight Sonata (1st Movement) - Beethoven',
    'Canon in D - Pachelbel',
    'Turkish March - Mozart',
    "Mariage d'Amour - Paul de Senneville",
    'Hugarian Sonata - Paul de Senneville',
    'Nocturne in C Sharp Minor - Chopin',
    'Waltz in A Minor - Chopin',
    'Carmen Habenera - Bizet'
  ],
  ballad: [
    "Can't Help Falling in Love - Elvis Presley",
    'My Heart Will Go On - James Horner & Will Jennings - Titanic(Celine Dion)',
    'Kiss The Rain - Yiruma',
    'River Flows in You - Yiruma',
    'Proud of You - Fiona Fung',
    "One Summer's Day - Joe Hisaishi - Spirited Away(Piano Version)"
  ],
  pop: [
    'Perfect - Ed Sheeran',
    'Until I Found You - Stephen Sanchez',
    'Someone You Loved - Lewis Capaldi',
    'I think they call this love - Ellot James Reay'
  ],
  jazz: [
    'Fly Me To The Moon',
    'Jingle Bells',
    "Merry go round of life - Joe Hisaishi - Howl's Moving Castle(Piano Version)",
    'Take Five',
    'What a Wonderful World'
  ]
};
const genreLabels = { classical: 'Classical', ballad: 'Ballad', pop: 'Pop', jazz: 'Jazz' };
const songModal = document.getElementById('songModal');
const modalPanel = songModal.querySelector('.modal-panel');
const closeModalButton = songModal.querySelector('.modal-close');
const modalTitle = document.getElementById('modalTitle');
const songList = document.getElementById('songList');
let previouslyFocused = null;

function openModal(style) {
  if (!Object.prototype.hasOwnProperty.call(songData, style)) return;
  previouslyFocused = document.activeElement;
  modalTitle.textContent = `Danh sách nhạc ${genreLabels[style]}`;
  songList.replaceChildren();
  songData[style].forEach(song => {
    const item = document.createElement('li');
    item.textContent = song;
    songList.appendChild(item);
  });
  songModal.classList.add('is-open');
  songModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  closeModalButton.focus();
}
function closeModal() {
  if (!songModal.classList.contains('is-open')) return;
  songModal.classList.remove('is-open');
  songModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  previouslyFocused?.focus();
}
document.querySelectorAll('[data-genre]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.genre)));
closeModalButton.addEventListener('click', closeModal);
songModal.addEventListener('click', event => { if (event.target === songModal) closeModal(); });
document.addEventListener('keydown', event => {
  if (!songModal.classList.contains('is-open')) return;
  if (event.key === 'Escape') closeModal();
  if (event.key === 'Tab') { // keep focus within the dialog
    const focusables = [...modalPanel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!focusables.length) { event.preventDefault(); modalPanel.focus(); return; }
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

// ===== Interactive piano: Web Audio API =====
// AudioContext is created only after a user gesture (needed by mobile browsers).
const frequencies = {
  C4:261.63, Cs4:277.18, D4:293.66, Ds4:311.13, E4:329.63, F4:349.23,
  Fs4:369.99, G4:392.00, Gs4:415.30, A4:440.00, As4:466.16, B4:493.88
};
const pianoKeys = [...document.querySelectorAll('.piano-key')];
const keyByLetter = new Map(pianoKeys.map(key => [key.dataset.key, key]));
const activeVoices = new Map();
const activeInputs = new Map();
let audioContext;

function getAudioContext() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audioContext = new Context();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function startNote(key, inputId) {
  if (!key || activeInputs.has(inputId)) return;
  const note = key.dataset.note;
  const frequency = frequencies[note];
  if (!frequency) return;
  activeInputs.set(inputId, key);
  key.classList.add('active');
  const ctx = getAudioContext();
  if (!ctx) return;

  // Three softly decaying harmonics give a warmer tone than one oscillator.
  const master = ctx.createGain();
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.095, now + 0.23);
  master.gain.exponentialRampToValueAtTime(0.012, now + 2.1);
  master.connect(ctx.destination);
  const oscillators = [
    { multiplier: 1, level: 0.62, type: 'triangle' },
    { multiplier: 2, level: 0.18, type: 'sine' },
    { multiplier: 3, level: 0.07, type: 'sine' }
  ].map(harmonic => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = harmonic.type;
    osc.frequency.value = frequency * harmonic.multiplier;
    gain.gain.value = harmonic.level;
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 3);
    return osc;
  });
  activeVoices.set(inputId, { master, oscillators, ctx });
}
function stopNote(inputId) {
  const key = activeInputs.get(inputId);
  if (!key) return;
  activeInputs.delete(inputId);
  if (![...activeInputs.values()].includes(key)) key.classList.remove('active');
  const voice = activeVoices.get(inputId);
  if (voice) {
    const now = voice.ctx.currentTime;
    voice.master.gain.cancelScheduledValues(now);
    voice.master.gain.setValueAtTime(Math.max(voice.master.gain.value, 0.0001), now);
    voice.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    activeVoices.delete(inputId);
  }
}

pianoKeys.forEach(key => {
  key.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    key.setPointerCapture?.(event.pointerId);
    startNote(key, `pointer-${event.pointerId}`);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => key.addEventListener(type, event => stopNote(`pointer-${event.pointerId}`)));
  // Standard button keyboard activation (Enter/Space) for accessibility.
  key.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); startNote(key, `button-${key.dataset.note}`);
    }
  });
  key.addEventListener('keyup', event => {
    if (event.key === 'Enter' || event.key === ' ') stopNote(`button-${key.dataset.note}`);
  });
});

document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (songModal.classList.contains('is-open')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const letter = event.key.toLowerCase();
  const key = keyByLetter.get(letter);
  if (!key) return;
  // Prevent triggering piano when using normal navigation or focused buttons.
  if (document.activeElement.matches('button:not(.piano-key), a')) return;
  startNote(key, `keyboard-${letter}`);
});
document.addEventListener('keyup', event => stopNote(`keyboard-${event.key.toLowerCase()}`));
window.addEventListener('blur', () => [...activeInputs.keys()].forEach(stopNote));

const labelToggle = document.querySelector('.key-label-toggle');
const pianoShell = document.querySelector('.piano-shell');
labelToggle.addEventListener('click', () => {
  const hidden = pianoShell.classList.toggle('hide-key-labels');
  labelToggle.setAttribute('aria-pressed', String(!hidden));
  labelToggle.innerHTML = `<i class="fa-regular fa-keyboard" aria-hidden="true"></i> ${hidden ? 'Hiện ký tự phím' : 'Ẩn ký tự phím'}`;
});
