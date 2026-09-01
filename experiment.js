/*
 * Hand-coded PsychoJS implementation of the Social Resource Allocation Task.
 * The interface is intentionally browser-native, while PsychoJS manages the
 * Pavlovia session and writes the data rows at the end of each trial.
 */
import { PsychoJS } from 'https://pavlovia.org/lib/core.js';
import { Scheduler } from 'https://pavlovia.org/lib/util.js';
import * as util from 'https://pavlovia.org/lib/util.js';

const EXPERIMENT_NAME = 'Social_Resource_Allocation_Task';
const VERSION = '0.2';
const N_TRIALS = 10;
const STARTING_BALANCE = 1000;
const REPAIR_AMOUNT = 300;
const PILOT = true;
const INPUT_GUARD_MS = 250;

const GROUPS = [
  { id: 'youth', name: 'Youth Fund', type: 'group', description: 'Fund for after-school programmes, looking to install after school music activities.', image: 'assets/images/youth_fund.png' },
  { id: 'sports', name: 'Sports Fund', type: 'group', description: 'Fund towards local sports facilities, looking to build multi-use games areas.', image: 'assets/images/sports_fund.png' },
];
const INDIVIDUALS = [
  { id: 'john', name: 'John Smith', type: 'individual', description: 'Represents local residents on the committee.', image: 'assets/images/john_smith.png' },
  { id: 'julia', name: 'Julia Hart', type: 'individual', description: 'Represents local residents on the committee.', image: 'assets/images/julia_hart.png' },
];
const SPLIT_OPTIONS = [
  { id: 1, self_amount: 700, target_amount: 300 },
  { id: 2, self_amount: 600, target_amount: 400 },
  { id: 3, self_amount: 500, target_amount: 500 },
  { id: 4, self_amount: 400, target_amount: 600 },
];
const SSGS_ITEMS = {
  1: 'I want to sink into the floor and disappear.',
  2: 'I feel remorse, regret.',
  3: 'I feel small.',
  4: 'I feel tension about something I have done.',
  5: 'I feel like I am a bad person.',
  6: 'I cannot stop thinking about something bad I have done.',
  7: 'I feel humiliated, disgraced.',
  8: 'I feel like apologizing, confessing.',
  9: 'I feel worthless, powerless.',
  10: 'I feel bad about something I have done.',
};

const app = document.querySelector('#app');
const psychoJS = new PsychoJS({ debug: false });
let expInfo = {};
let participantId = '';
let narration = null;
let inputAllowedAfter = 0;
let psychoJSStarted = false;
let shamePool = [];
let guiltPool = [];
let audioUnlocker = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nowSeconds() {
  return performance.now() / 1000;
}

function render(content, extraClass = '') {
  app.innerHTML = `<section class="panel ${extraClass}">${content}</section>`;
}

function stopNarration() {
  if (narration) {
    narration.pause();
    narration.currentTime = 0;
    narration = null;
  }
}

function playNarration(path, statusNode = null) {
  stopNarration();
  narration = new Audio(path);
  narration.preload = 'auto';
  narration.addEventListener('ended', () => {
    if (statusNode) statusNode.textContent = 'Narration finished.';
  });
  narration.play().then(() => {
    if (statusNode) statusNode.textContent = 'Narration playing.';
  }).catch(() => {
    if (statusNode) statusNode.textContent = 'Narration is ready. Select “Play narration” if it did not start.';
  });
}

function attachReplay(path) {
  const replay = document.querySelector('#replay-audio');
  const status = document.querySelector('#audio-status');
  if (!replay || !status) return;
  replay.addEventListener('click', () => playNarration(path, status));
}

function waitForButton(selector) {
  const button = document.querySelector(selector);
  return new Promise((resolve) => {
    button.addEventListener('click', () => {
      const currentTime = performance.now();
      if (currentTime < inputAllowedAfter) return;
      inputAllowedAfter = currentTime + INPUT_GUARD_MS;
      button.disabled = true;
      resolve();
    }, { once: false });
  });
}

function waitForSelection(selector) {
  const buttons = [...document.querySelectorAll(selector)];
  return new Promise((resolve) => {
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const currentTime = performance.now();
        if (currentTime < inputAllowedAfter) return;
        inputAllowedAfter = currentTime + INPUT_GUARD_MS;
        buttons.forEach((candidate) => { candidate.disabled = true; });
        resolve(button.dataset.value);
      });
    });
  });
}

function addDataRow(values) {
  Object.entries(values).forEach(([key, value]) => psychoJS.experiment.addData(key, value));
  psychoJS.experiment.nextEntry();
}

function writeEvent(eventName, values = {}) {
  addDataRow({
    record_type: eventName,
    experiment: EXPERIMENT_NAME,
    version: VERSION,
    participant_id: participantId,
    timestamp: new Date().toISOString(),
    ...values,
  });
}

async function startPsychoJS() {
  psychoJS.openWindow({ fullscr: false, color: new util.Color([0, 0, 0]), units: 'height' });
  psychoJS.schedule(() => Scheduler.Event.FLIP_REPEAT);
  await psychoJS.start({ expName: EXPERIMENT_NAME, expInfo });
  psychoJSStarted = true;
}

function instructionHtml(title, body, audioPath = null) {
  const audioControls = audioPath ? `
    <div class="actions"><button id="replay-audio" class="secondary">Play narration</button></div>
    <p id="audio-status" class="audio-status">Narration starting…</p>` : '';
  return `<h2>${title}</h2><p class="instruction-body">${body}</p>${audioControls}
    <div class="actions"><button id="continue" class="primary">Continue</button></div>`;
}

async function showInstruction(title, body, audioPath = null) {
  render(instructionHtml(title, body, audioPath));
  if (audioPath) {
    const status = document.querySelector('#audio-status');
    playNarration(audioPath, status);
    attachReplay(audioPath);
  }
  await waitForButton('#continue');
  stopNarration();
}

async function showProfiles(title, subtitle, targets, theme, audioPath) {
  const cards = targets.map((target) => `
    <article class="profile ${theme}">
      <img src="${target.image}" alt="${escapeHtml(target.name)}">
      <h3>${escapeHtml(target.name)}</h3>
      <p>${escapeHtml(target.description)}</p>
    </article>`).join('');
  render(`<h2>${title}</h2><p class="instruction-body">${subtitle}</p>
    <div class="profiles">${cards}</div>
    <div class="actions"><button id="replay-audio" class="secondary">Play narration</button><button id="continue" class="primary">Continue</button></div>
    <p id="audio-status" class="audio-status">Narration starting…</p>`);
  const status = document.querySelector('#audio-status');
  playNarration(audioPath, status);
  attachReplay(audioPath);
  await waitForButton('#continue');
  stopNarration();
}

async function showDemo() {
  render(`<h2>Example round</h2><p class="instruction-body">Select <strong>Start demonstration</strong> to play the example. The screen will become available to continue after the narration ends.</p>
    <div class="video-wrap"><video id="demo-video" playsinline muted preload="metadata"><source src="assets/task_demo_slow.mp4" type="video/mp4"></video></div>
    <p id="demo-status" class="audio-status">The demonstration has not started.</p>
    <div class="actions"><button id="start-demo" class="primary">Start demonstration</button><button id="continue" class="primary" disabled>Continue</button></div>`);
  const video = document.querySelector('#demo-video');
  const status = document.querySelector('#demo-status');
  const start = document.querySelector('#start-demo');
  const continueButton = document.querySelector('#continue');
  start.addEventListener('click', () => {
    start.disabled = true;
    video.currentTime = 0;
    video.play().catch(() => { status.textContent = 'Use the video controls to play the demonstration.'; video.controls = true; });
    playNarration('assets/audio/08_demo_intro.wav', status);
    if (narration) narration.addEventListener('ended', () => { continueButton.disabled = false; }, { once: true });
  }, { once: true });
  await waitForButton('#continue');
  stopNarration();
  video.pause();
}

function buildTargets() {
  return [...GROUPS, ...INDIVIDUALS];
}

function buildTrials() {
  const targets = buildTargets();
  const design = [];
  const repetitions = Math.floor(N_TRIALS / targets.length);
  const remainder = N_TRIALS % targets.length;
  targets.forEach((target) => {
    for (let index = 0; index < repetitions; index += 1) design.push({ ...target });
  });
  shuffle(targets).slice(0, remainder).forEach((target) => design.push({ ...target }));
  return shuffle(design).map((target, index) => ({
    ...target,
    trial_num: index + 1,
    split_options: shuffle(SPLIT_OPTIONS).map((option) => ({ ...option, generosity: option.target_amount / STARTING_BALANCE })),
  }));
}

function initialiseHiddenTargets() {
  const youthLenient = Math.random() < 0.5;
  const johnYouth = Math.random() < 0.5;
  return {
    groups: {
      youth: { threshold: youthLenient ? 0.4 : 0.6 },
      sports: { threshold: youthLenient ? 0.6 : 0.4 },
    },
    individuals: { john: johnYouth ? 'youth' : 'sports', julia: johnYouth ? 'sports' : 'youth' },
  };
}

function feedbackFor(trial, choice, hidden) {
  const evaluatorGroup = trial.type === 'group' ? trial.id : hidden.individuals[trial.id];
  const threshold = hidden.groups[evaluatorGroup].threshold;
  const probability = 1 / (1 + Math.exp(-12 * (choice.generosity - threshold)));
  return {
    evaluator_group: evaluatorGroup,
    threshold,
    approval_probability: probability,
    approved: Math.random() < probability,
  };
}

function targetCard(trial) {
  const theme = trial.type === 'group' ? 'teal' : 'amber';
  return `<aside class="target-card ${theme}"><img class="target-image" src="${trial.image}" alt="${escapeHtml(trial.name)}"><h3>${trial.type === 'group' ? 'Group' : 'Individual'}: ${escapeHtml(trial.name)}</h3><p>${escapeHtml(trial.description)}</p></aside>`;
}

async function chooseAllocation(trial, balance) {
  const choices = trial.split_options.map((option) => `<button class="choice allocation" data-value="${option.id}">Keep £${option.self_amount}\nGive £${option.target_amount}</button>`).join('');
  render(`<p class="fund">Your personal fund: £${balance.toFixed(2)}</p><h2>Choose how much to keep and how much to give</h2>
    <div class="trial-grid"><div class="choices">${choices}</div>${targetCard(trial)}</div>`);
  const onset = nowSeconds();
  const selectedId = Number(await waitForSelection('.allocation'));
  return { choice: trial.split_options.find((option) => option.id === selectedId), responseTime: nowSeconds() - onset };
}

async function choosePrediction(trial) {
  const question = trial.type === 'group'
    ? `Do the ${trial.name} representatives think your decision was socially appropriate?`
    : `Does ${trial.name} think your decision treated them fairly?`;
  render(`<h2>${question}</h2><div class="prediction-target">${targetCard(trial)}</div><div class="decision-row"><button class="primary prediction" data-value="approve">YES</button><button class="primary prediction" data-value="disapprove">NO</button></div>`);
  const onset = nowSeconds();
  const prediction = await waitForSelection('.prediction');
  return { prediction, responseTime: nowSeconds() - onset };
}

async function chooseConfidence() {
  const options = [1, 2, 3, 4, 5].map((value) => `<button class="rating-option confidence" data-value="${value}">${value}</button>`).join('');
  render(`<h2>How confident are you in your prediction?</h2><p class="muted">1 = not at all confident &nbsp;&nbsp;&nbsp; 5 = very confident</p><div class="scale">${options}</div>`);
  const onset = nowSeconds();
  const confidence = Number(await waitForSelection('.confidence'));
  return { confidence, responseTime: nowSeconds() - onset };
}

async function fetchingEvaluation() {
  render('<p class="fetching">The evaluation is being considered…</p>');
  await new Promise((resolve) => window.setTimeout(resolve, 1500));
}

async function showFeedback(trial, feedback) {
  const isGroup = trial.type === 'group';
  const message = isGroup
    ? (feedback.approved ? `The ${trial.name} representatives decided that your decision was in line with their community norms.` : `The ${trial.name} representatives decided your decision violated their community norms.`)
    : (feedback.approved ? `${trial.name} decided they were treated fairly.` : `${trial.name} decided that your decision treated them unfairly.`);
  const visibility = isGroup ? 'This decision will appear on your committee record.' : `This decision will only be visible to yourself and ${trial.name}.`;
  render(`<h2 class="feedback ${feedback.approved ? 'good' : 'bad'}">${message}</h2><div class="profiles">${targetCard(trial)}</div><p>${visibility}</p><div class="actions"><button id="continue" class="primary">Continue</button></div>`);
  await waitForButton('#continue');
}

function nextAlternateItem(type) {
  const pool = type === 'shame' ? shamePool : guiltPool;
  if (pool.length === 0) {
    const items = type === 'shame' ? [1, 3, 5, 7, 9] : [2, 4, 6, 8, 10];
    if (type === 'shame') shamePool = shuffle(items); else guiltPool = shuffle(items);
  }
  return type === 'shame' ? shamePool.pop() : guiltPool.pop();
}

function emotionProbeSchedule(nTrials) {
  const counts = [];
  for (let count = 5; count <= Math.floor(nTrials / 2); count += 5) counts.push(count);
  if (counts.length === 0) return new Set();
  const count = counts.reduce((best, candidate) => Math.abs(nTrials / candidate - 2.5) < Math.abs(nTrials / best - 2.5) ? candidate : best, counts[0]);
  const gaps = shuffle(Array(Math.min(count, nTrials - 2 * count)).fill(3).concat(Array(count - Math.min(count, nTrials - 2 * count)).fill(2)));
  let trialNumber = 0;
  return new Set(gaps.map((gap) => { trialNumber += gap; return trialNumber; }));
}

async function emotionProbe() {
  const itemNumbers = shuffle([nextAlternateItem('shame'), nextAlternateItem('guilt')]);
  const rows = itemNumbers.map((item) => `<div class="likert-row"><p>${escapeHtml(SSGS_ITEMS[item])}</p><div class="scale">${[1, 2, 3, 4, 5].map((rating) => `<button class="rating-option emotion-${item}" data-value="${rating}">${rating}</button>`).join('')}</div></div>`).join('');
  render(`<h2>Right now, how much do you feel each of the following?</h2><p class="muted">1 = Not at all &nbsp;&nbsp; 3 = Somewhat &nbsp;&nbsp; 5 = Very strongly</p>${rows}<div class="actions"><button id="continue" class="primary" disabled>Continue</button></div>`);
  const onset = nowSeconds();
  const responses = {};
  itemNumbers.forEach((item) => {
    document.querySelectorAll(`.emotion-${item}`).forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll(`.emotion-${item}`).forEach((candidate) => candidate.classList.remove('selected'));
      button.classList.add('selected');
      responses[item] = Number(button.dataset.value);
      document.querySelector('#continue').disabled = itemNumbers.some((number) => responses[number] === undefined);
    }));
  });
  await waitForButton('#continue');
  const responseRow = Object.fromEntries(Object.keys(SSGS_ITEMS).map((item) => [item, responses[item] ?? '']));
  const shameItem = itemNumbers.find((item) => item % 2 === 1);
  const guiltItem = itemNumbers.find((item) => item % 2 === 0);
  return { responses: responseRow, shame: responses[shameItem], guilt: responses[guiltItem], responseTime: nowSeconds() - onset };
}

async function chooseRepair(trial) {
  render(`<h2>What would you like to do?</h2><p>Giving money costs £${REPAIR_AMOUNT} from your personal fund.</p><div class="vertical-choices"><button class="primary repair" data-value="target">Give £${REPAIR_AMOUNT} to ${escapeHtml(trial.name)}</button><button class="primary repair" data-value="community">Give £${REPAIR_AMOUNT} to future community projects</button><button class="primary repair" data-value="none">Do nothing</button></div>`);
  const onset = nowSeconds();
  const repairChoice = await waitForSelection('.repair');
  return { repairChoice, responseTime: nowSeconds() - onset };
}

async function runTrials() {
  const trials = buildTrials();
  const hidden = initialiseHiddenTargets();
  const probeTrials = emotionProbeSchedule(trials.length);
  let balance = STARTING_BALANCE;
  for (const trial of trials) {
    const allocation = await chooseAllocation(trial, balance);
    const prediction = await choosePrediction(trial);
    const confidence = await chooseConfidence();
    const feedback = feedbackFor(trial, allocation.choice, hidden);
    balance += allocation.choice.self_amount;
    await fetchingEvaluation();
    await showFeedback(trial, feedback);
    let emotion = null;
    if (probeTrials.has(trial.trial_num)) emotion = await emotionProbe();
    let repair = { repairChoice: '', responseTime: '' };
    if (!feedback.approved) {
      repair = await chooseRepair(trial);
      if (repair.repairChoice !== 'none') balance -= REPAIR_AMOUNT;
    }
    writeEvent('trial', {
      trial_num: trial.trial_num,
      target_type: trial.type,
      target_name: trial.name,
      evaluator_group: feedback.evaluator_group,
      self_amount: allocation.choice.self_amount,
      target_amount: allocation.choice.target_amount,
      generosity: allocation.choice.generosity,
      current_funds: balance,
      allocation_response_time: allocation.responseTime,
      prediction_response_time: prediction.responseTime,
      confidence_response_time: confidence.responseTime,
      emotion_response_time: emotion ? emotion.responseTime : '',
      repair_response_time: repair.responseTime,
      prediction: prediction.prediction,
      confidence: confidence.confidence,
      approved: feedback.approved,
      approval_probability: feedback.approval_probability,
      approval_threshold: feedback.threshold,
      repair_choice: repair.repairChoice,
      SSGS_1: emotion ? emotion.responses[1] : '', SSGS_2: emotion ? emotion.responses[2] : '',
      SSGS_3: emotion ? emotion.responses[3] : '', SSGS_4: emotion ? emotion.responses[4] : '',
      SSGS_5: emotion ? emotion.responses[5] : '', SSGS_6: emotion ? emotion.responses[6] : '',
      SSGS_7: emotion ? emotion.responses[7] : '', SSGS_8: emotion ? emotion.responses[8] : '',
      SSGS_9: emotion ? emotion.responses[9] : '', SSGS_10: emotion ? emotion.responses[10] : '',
      SSGS_shame: emotion ? emotion.shame : '', SSGS_guilt: emotion ? emotion.guilt : '',
    });
  }
}

async function pilotChecks() {
  render(`<h2>Final questions</h2><div class="question"><p>How real did the evaluations in this section feel to you?</p><input id="believability" type="range" min="0" max="100" value="50"><div class="slider-labels muted"><span>Not at all real</span><span>Completely real</span></div></div>
    <div class="question"><label for="evaluators">In your own words, who were the evaluators in this task, and what did they base their decisions on?</label><textarea id="evaluators"></textarea></div>
    <div class="question"><label for="visibility">Who could see each type of decision you made?</label><textarea id="visibility"></textarea></div><div class="actions"><button id="continue" class="primary">Continue</button></div>`);
  await waitForButton('#continue');
  const pageOne = { believability: document.querySelector('#believability').value, evaluators: document.querySelector('#evaluators').value, visibility: document.querySelector('#visibility').value };
  render(`<h2>Final questions</h2><div class="question"><label for="importance">Did it matter to you what individuals and group representatives thought of you? If so, why?</label><textarea id="importance"></textarea></div>
    <div class="question"><label for="hypothesis">Do you have any thoughts on what this study was really investigating?</label><textarea id="hypothesis"></textarea></div>
    <div class="question"><label for="suspicion">At any point during the task, did you doubt that the evaluations were genuine? If yes, please explain.</label><textarea id="suspicion"></textarea></div><div class="actions"><button id="continue" class="primary">Continue</button></div>`);
  await waitForButton('#continue');
  writeEvent('pilot_checks', { ...pageOne, importance: document.querySelector('#importance').value, hypothesis: document.querySelector('#hypothesis').value, suspicion: document.querySelector('#suspicion').value });
}

async function ethicalDebrief() {
  await showInstruction('About this study', `The social feedback in this task was simulated and generated by the study’s programmed procedure. No person, group, or committee member judged any of your decisions.\n\nNothing in this task reflects your worth, character, or real behaviour.\n\nThis study examines how people respond to perceived social evaluation and to decisions about allocating resources. The statement that your public record would be reviewed for a bonus was a motivational framing element. Your decisions were not reviewed by members of a virtual committee.\n\nThank you for taking part. Your contribution is useful for helping researchers understand these processes.`);
  await showInstruction('Your data and study contacts', `You may request withdrawal of your data by [INSERT APPROVED WITHDRAWAL DEADLINE].\n\nTo do so, contact: [INSERT WITHDRAWAL CONTACT EMAIL]\n[INSERT APPROVED WITHDRAWAL PROCEDURE, INCLUDING ANY PARTICIPANT ID OR STUDY REFERENCE.]\n\nResearcher: [INSERT RESEARCHER NAME AND EMAIL]\nSupervisor: [INSERT SUPERVISOR NAME AND EMAIL]\n\nFor concerns or complaints about the study or your participant rights:\n[INSERT ETHICS-COMPLAINTS CONTACT DETAILS]`);
  await showInstruction('Before you leave', `If any part of this task has left you feeling unsettled, take a moment to notice your surroundings and return your attention to your day at your own pace.\n\nYou may wish to speak with someone you trust or use a support service.\n\nUK and Republic of Ireland: Samaritans — call 116 123, free, 24 hours a day. In England, for urgent mental-health support, call NHS 111 and select the mental-health option. In an emergency or if anyone is in immediate danger, call 999 or go to A&E.\n\nThank you again for your time and contribution.`);
}

async function finishExperiment() {
  render('<h2>Thank you</h2><p>Your responses have been recorded. Select Finish to close the task.</p><div class="actions"><button id="finish" class="primary">Finish</button></div>');
  await waitForButton('#finish');
  if (psychoJSStarted) {
    // Keep a visible, non-interactive page on screen while PsychoJS submits
    // the data and closes the Pavlovia session. This prevents participants
    // from mistaking a blank page for completion and closing too early.
    render('<h2>Saving your responses…</h2><p>Please keep this page open while your session is submitted.</p>');
    // PsychoJS uses #root (provided by index.html) to show its final,
    // acknowledged completion dialog after the server has confirmed saving.
    await psychoJS.quit({ message: '', isCompleted: true });
  }
}

async function runExperiment() {
  await showInstruction('Community Committee', 'You have been invited to assist a local committee as a temporary fund manager.\n\nYou will make funding decisions for the community.', 'assets/audio/01_community_committee.wav');
  await showInstruction('Who will receive funds?', '• Two community groups — a Youth Fund and a Sports Fund\n• Two individual committee members\n• Yourself\n\nGroups and individuals will evaluate your decisions in different ways.', 'assets/audio/02_recipients.wav');
  await showProfiles('Community Groups', 'Evaluate your decisions based on whether they align with their community standards of fairness.', GROUPS, 'teal', 'assets/audio/03_community_groups.wav');
  await showProfiles('Individual Committee Members', 'Individuals judge your decisions on whether they feel fairly treated. Each belongs to one group, but you will not be told which.', INDIVIDUALS, 'amber', 'assets/audio/04_individual_members.wav');
  await showInstruction('How each trial works', '1. Choose a split\n2. Predict their response\n3. Rate your confidence\n4. See their evaluation\n5. If they disapprove, choose whether to repair\n\nOccasionally you will rate how you feel.', 'assets/audio/05_round_sequence.wav');
  await showInstruction('Public vs. private decisions', 'Group decisions: public — added to your committee record\n\nIndividual decisions: private — seen only by you and that individual.', 'assets/audio/06_public_private.wav');
  await showInstruction('Your bonus', '• Money you keep is added to your personal fund.\n• Repairing a decision reduces your personal fund.\n• Your public committee record is used to determine your bonus.\n\nYour final payment depends on your fund and bonus.', 'assets/audio/07_bonus.wav');
  await showInstruction('Demonstration — before you begin', 'You will now see an example round.\n\nWatch how to make a decision, predict a response, view feedback, and choose whether to repair.');
  await showDemo();
  await showInstruction('Ready to begin', 'You will now begin the experiment.\n\nOn each trial, choose how to divide the amount shown between yourself and one group or individual. Then predict their response and rate your confidence.\n\nPlease respond as you genuinely would. There are no right or wrong answers.');
  await runTrials();
  if (PILOT) await pilotChecks();
  await ethicalDebrief();
  await finishExperiment();
}

document.querySelector('#start-experiment').addEventListener('click', async () => {
  const startButton = document.querySelector('#start-experiment');
  startButton.disabled = true;
  participantId = document.querySelector('#participant-id').value.trim() || `anon_${Date.now()}`;
  expInfo = { participant: participantId, session: '001', date: new Date().toISOString(), expName: EXPERIMENT_NAME, version: VERSION };
  // The explicit user gesture below is intentional: it unlocks browser audio
  // playback before narrated instruction pages are presented.
  audioUnlocker = new Audio('assets/audio/01_community_committee.wav');
  audioUnlocker.muted = true;
  audioUnlocker.play().then(() => {
    audioUnlocker.pause();
    audioUnlocker.currentTime = 0;
  }).catch(() => {});
  try {
    await startPsychoJS();
    await runExperiment();
  } catch (error) {
    stopNarration();
    render(`<h2>Unable to start the experiment</h2><p class="error">${escapeHtml(error?.message || error)}</p><p>Please reload the page. If this happens on Pavlovia, contact the researcher.</p>`);
  }
});
