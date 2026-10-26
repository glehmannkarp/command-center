// Ask the browser not to clear saved data on its own (e.g. Safari after a week unused)
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
}

// --- PAGE NAVIGATION LOGIC ---
const navButtons = document.querySelectorAll('.nav-btn');
const appPages = document.querySelectorAll('.app-page');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');

// Switch between dashboard, tasks, and calendar tabs
navButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons
        navButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        button.classList.add('active');

        // Hide all pages
        appPages.forEach(page => page.classList.remove('active-page'));
        // Show target page
        const targetPageId = button.getAttribute('data-target');
        document.getElementById(targetPageId).classList.add('active-page');

        // Pick up any tasks or events changed on the other pages
        if (targetPageId === 'dashboard-page') renderDashboard();
        if (targetPageId === 'calendar-page') renderCalendar();
    });
});

// Sidebar hamburger expand/collapse toggle
toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});


// --- UNDO TOAST ---
// After a delete, a toast offers "Undo" for a few seconds. A newer delete replaces the older offer.
const undoToast = document.getElementById('undo-toast');
const undoMessage = document.getElementById('undo-message');
const undoBtn = document.getElementById('undo-btn');

const UNDO_TIMEOUT_MS = 6000;
let undoAction = null;
let undoTimer = null;

function hideUndoToast() {
    clearTimeout(undoTimer);
    undoToast.hidden = true;
    undoAction = null;
}

function showUndoToast(message, onUndo) {
    clearTimeout(undoTimer);
    undoMessage.textContent = message;
    undoAction = onUndo;
    undoToast.hidden = false;
    undoTimer = setTimeout(hideUndoToast, UNDO_TIMEOUT_MS);
}

undoBtn.addEventListener('click', () => {
    if (undoAction) undoAction();
    hideUndoToast();
});


// --- DIGITAL CLOCK WIDGET LOGIC ---
function updateClock() {
    const clockElement = document.getElementById('digital-clock');
    const now = new Date();
    
    const period = now.getHours() < 12 ? 'AM' : 'PM';
    const hours = now.getHours() % 12 || 12; // 0 → 12 AM, 13 → 1 PM
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();

    // Pad single digits with a leading zero
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    const periodElement = document.createElement('span');
    periodElement.className = 'clock-period';
    periodElement.textContent = period;
    clockElement.replaceChildren(`${hours}:${minutes}:${seconds} `, periodElement);
}

// Update clock every single second
setInterval(updateClock, 1000);
updateClock(); // Initial run immediately


// --- FOCUS TIMER WIDGET LOGIC ---
const modeButtons = document.querySelectorAll('.mode-btn');
const timerDisplay = document.getElementById('timer-display');
const startTimerBtn = document.getElementById('start-timer');
const pauseTimerBtn = document.getElementById('pause-timer');
const stopTimerBtn = document.getElementById('stop-timer');

let timerDuration = 1500;   // Length of the selected mode, in seconds
let timeRemaining = timerDuration;
let timerInterval = null;   // Holds the running interval, or null when paused/stopped

function renderTimer() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timerDisplay.textContent = display;
    // Show the countdown in the browser tab while it's running
    document.title = timerInterval ? `${display} - Personal Command Center` : 'Personal Command Center';
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    renderTimer();
}

function resetTimer() {
    pauseTimer();
    timeRemaining = timerDuration;
    renderTimer();
}

function startTimer() {
    if (timerInterval) return; // Already running
    if (timeRemaining <= 0) timeRemaining = timerDuration;

    timerInterval = setInterval(() => {
        timeRemaining--;
        renderTimer();

        if (timeRemaining <= 0) {
            pauseTimer();
            timerDisplay.textContent = "Time's up!";
        }
    }, 1000);
    renderTimer();
}

// Switching modes loads the new duration and resets the countdown
modeButtons.forEach(button => {
    button.addEventListener('click', () => {
        modeButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        timerDuration = parseInt(button.getAttribute('data-time'), 10);
        resetTimer();
    });
});

// Custom length: any number of minutes (decimals allowed, e.g. 0.5 = 30 seconds)
const customMinutesInput = document.getElementById('custom-minutes');
const setCustomTimerBtn = document.getElementById('set-custom-timer');
const CUSTOM_TIMER_STORAGE_KEY = 'commandCenter.customTimerMinutes';
const MAX_CUSTOM_MINUTES = 999;

try {
    customMinutesInput.value = localStorage.getItem(CUSTOM_TIMER_STORAGE_KEY) || '';
} catch {
    // Storage unavailable - start with an empty box
}

function setCustomTimer() {
    const minutes = parseFloat(customMinutesInput.value);
    if (!(minutes > 0)) {
        customMinutesInput.focus();
        return;
    }

    const clampedMinutes = Math.min(minutes, MAX_CUSTOM_MINUTES);
    customMinutesInput.value = clampedMinutes;
    try {
        localStorage.setItem(CUSTOM_TIMER_STORAGE_KEY, clampedMinutes);
    } catch {
        // Storage unavailable - the custom time still works until refresh
    }

    modeButtons.forEach(btn => btn.classList.remove('active'));
    timerDuration = Math.max(1, Math.round(clampedMinutes * 60));
    resetTimer();
}

setCustomTimerBtn.addEventListener('click', setCustomTimer);
customMinutesInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') setCustomTimer();
});

startTimerBtn.addEventListener('click', startTimer);
pauseTimerBtn.addEventListener('click', pauseTimer);
stopTimerBtn.addEventListener('click', resetTimer);

renderTimer();


// --- TASK MANAGER LOGIC ---
const newTaskInput = document.getElementById('new-task-input');
const taskPrioritySelect = document.getElementById('task-priority');
const taskDueInput = document.getElementById('task-due');
const addTaskBtn = document.getElementById('add-task-btn');
const taskSortSelect = document.getElementById('task-sort');
const todoList = document.getElementById('todo-list');
const todoEmpty = document.getElementById('todo-empty');

const TASKS_STORAGE_KEY = 'commandCenter.tasks';
const TASK_SORT_STORAGE_KEY = 'commandCenter.taskSort';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Each task looks like: { id, text, priority, completed, dueDate: 'YYYY-MM-DD' or '' }
let tasks = loadTasks();
let editingTaskId = null; // Task currently shown as an edit form, or null

function loadTasks() {
    try {
        return JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY)) || [];
    } catch {
        return []; // Storage unavailable or corrupted - start fresh
    }
}

function saveTasks() {
    try {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
        // Storage unavailable (e.g. private browsing) - tasks still work until refresh
    }
}

try {
    taskSortSelect.value = localStorage.getItem(TASK_SORT_STORAGE_KEY) || 'priority';
} catch {
    // Storage unavailable - default to sorting by priority
}

function addTask() {
    const text = newTaskInput.value.trim();
    if (!text) return;

    tasks.push({
        id: Date.now().toString(),
        text,
        priority: taskPrioritySelect.value,
        completed: false,
        dueDate: taskDueInput.value
    });

    newTaskInput.value = '';
    taskDueInput.value = '';
    newTaskInput.focus();
    saveTasks();
    renderTasks();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
}

function deleteTask(id) {
    const index = tasks.findIndex(t => t.id === id);
    const [removed] = tasks.splice(index, 1);
    if (editingTaskId === id) editingTaskId = null;
    saveTasks();
    renderTasks();

    showUndoToast('Task deleted', () => {
        tasks.splice(Math.min(index, tasks.length), 0, removed); // Back in its old spot
        saveTasks();
        renderTasks();
    });
}

function startEditingTask(id) {
    editingTaskId = id;
    renderTasks();
}

function cancelEditingTask() {
    editingTaskId = null;
    renderTasks();
}

function saveEditedTask(id, text, priority, dueDate) {
    const task = tasks.find(t => t.id === id);
    if (text.trim()) task.text = text.trim();
    task.priority = priority;
    task.dueDate = dueDate;
    editingTaskId = null;
    saveTasks();
    renderTasks();
}

// Finished tasks always sink to the bottom. Ties keep the order the tasks were added in.
function compareTasks(a, b, sortBy) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    // Tasks with no due date go after ones that have one
    const byDueDate = (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');

    return sortBy === 'dueDate'
        ? byDueDate || byPriority
        : byPriority || byDueDate;
}

function getSortedTasks() {
    const sortBy = taskSortSelect.value;
    return tasks
        .map((task, index) => ({ task, index }))
        .sort((a, b) => compareTasks(a.task, b.task, sortBy) || a.index - b.index)
        .map(({ task }) => task);
}

// Label and style for a due date: "Overdue · Oct 20", "Due today", "Due Oct 28"
function describeDueDate(task) {
    const todayKey = toDateKey(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatted = parseDateKey(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    if (task.completed) return { label: `Due ${formatted}`, className: '' };
    if (task.dueDate < todayKey) return { label: `Overdue · ${formatted}`, className: 'overdue' };
    if (task.dueDate === todayKey) return { label: 'Due today', className: 'due-today' };
    if (task.dueDate === toDateKey(tomorrow)) return { label: 'Due tomorrow', className: '' };
    return { label: `Due ${formatted}`, className: '' };
}

function createPrioritySelect(selected) {
    const select = document.createElement('select');
    select.className = 'task-edit-priority';
    ['low', 'medium', 'high'].forEach(priority => {
        const option = document.createElement('option');
        option.value = priority;
        option.textContent = `${priority[0].toUpperCase()}${priority.slice(1)} Priority`;
        option.selected = priority === selected;
        select.appendChild(option);
    });
    return select;
}

// Inline edit form: Enter (or ✓) saves, Escape (or ✕) cancels
function createTaskEditElement(task) {
    const taskItem = document.createElement('li');
    taskItem.className = 'task-item editing';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'task-edit-input';
    textInput.value = task.text;

    const prioritySelect = createPrioritySelect(task.priority);

    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.className = 'task-edit-due';
    dueInput.value = task.dueDate || '';
    dueInput.title = 'Due date (optional)';

    const save = () => saveEditedTask(task.id, textInput.value, prioritySelect.value, dueInput.value);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✅';
    saveBtn.title = 'Save changes';
    saveBtn.addEventListener('click', save);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '❌';
    cancelBtn.title = 'Cancel';
    cancelBtn.addEventListener('click', cancelEditingTask);

    actions.append(saveBtn, cancelBtn);
    taskItem.append(textInput, prioritySelect, dueInput, actions);

    taskItem.addEventListener('keydown', event => {
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') cancelEditingTask();
    });

    return taskItem;
}

function createTaskElement(task) {
    if (task.id === editingTaskId) return createTaskEditElement(task);

    const taskItem = document.createElement('li');
    taskItem.className = 'task-item' + (task.completed ? ' completed' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleTask(task.id));

    // textContent (not innerHTML) so task text can never inject HTML
    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.text;

    taskItem.append(checkbox, textSpan);

    if (task.dueDate) {
        const { label, className } = describeDueDate(task);
        const dueSpan = document.createElement('span');
        dueSpan.className = `task-due ${className}`.trim();
        dueSpan.textContent = label;
        taskItem.appendChild(dueSpan);
    }

    const badge = document.createElement('span');
    badge.className = `priority-badge priority-${task.priority}`;
    badge.textContent = task.priority;

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit task';
    editBtn.addEventListener('click', () => startEditingTask(task.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete task';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    actions.append(editBtn, deleteBtn);
    taskItem.append(badge, actions);
    return taskItem;
}

function renderTasks() {
    todoList.innerHTML = '';
    getSortedTasks().forEach(task => todoList.appendChild(createTaskElement(task)));
    todoEmpty.hidden = tasks.length > 0;

    const editInput = todoList.querySelector('.task-edit-input');
    if (editInput) editInput.focus();
}

addTaskBtn.addEventListener('click', addTask);
newTaskInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') addTask();
});
taskSortSelect.addEventListener('change', () => {
    try {
        localStorage.setItem(TASK_SORT_STORAGE_KEY, taskSortSelect.value);
    } catch {
        // Storage unavailable - sort still applies until refresh
    }
    renderTasks();
});

renderTasks();


// --- HABIT TRACKER LOGIC ---
const newHabitInput = document.getElementById('new-habit-input');
const addHabitBtn = document.getElementById('add-habit-btn');
const habitList = document.getElementById('habit-list');
const habitEmpty = document.getElementById('habit-empty');

const HABITS_STORAGE_KEY = 'commandCenter.habits';
const DAY_LABELS = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];

// Each habit looks like: { id, name, completedDates: ['2026-10-26', ...] }
let habits = loadHabits();

function loadHabits() {
    try {
        return JSON.parse(localStorage.getItem(HABITS_STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveHabits() {
    try {
        localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
    } catch {
        // Storage unavailable - habits still work until refresh
    }
}

// Format a date as YYYY-MM-DD in local time (toISOString would use UTC and can shift the day)
function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// The 7 dates of the current week, Monday first
function getCurrentWeekDates() {
    const today = new Date();
    const daysSinceMonday = (today.getDay() + 6) % 7; // getDay(): Sunday = 0
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);

    return DAY_LABELS.map((_, i) =>
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    );
}

// Consecutive days completed, counting back from today.
// If today isn't ticked yet, count from yesterday so the streak isn't "lost" mid-day.
function calculateStreak(habit) {
    const done = new Set(habit.completedDates);
    const day = new Date();
    if (!done.has(toDateKey(day))) day.setDate(day.getDate() - 1);

    let streak = 0;
    while (done.has(toDateKey(day))) {
        streak++;
        day.setDate(day.getDate() - 1);
    }
    return streak;
}

function addHabit() {
    const name = newHabitInput.value.trim();
    if (!name) return;

    habits.push({ id: Date.now().toString(), name, completedDates: [] });
    newHabitInput.value = '';
    newHabitInput.focus();
    saveHabits();
    renderHabits();
}

function toggleHabitDay(id, dateKey) {
    const habit = habits.find(h => h.id === id);
    if (habit.completedDates.includes(dateKey)) {
        habit.completedDates = habit.completedDates.filter(d => d !== dateKey);
    } else {
        habit.completedDates.push(dateKey);
    }
    saveHabits();
    renderHabits();
}

function deleteHabit(id) {
    const index = habits.findIndex(h => h.id === id);
    const [removed] = habits.splice(index, 1);
    saveHabits();
    renderHabits();

    showUndoToast('Habit deleted', () => {
        habits.splice(Math.min(index, habits.length), 0, removed);
        saveHabits();
        renderHabits();
    });
}

function createHabitElement(habit, weekDates, todayKey) {
    const row = document.createElement('div');
    row.className = 'habit-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'habit-name';
    nameSpan.textContent = habit.name;

    const daysContainer = document.createElement('div');
    daysContainer.className = 'habit-days';

    weekDates.forEach((date, i) => {
        const dateKey = toDateKey(date);
        const dayBtn = document.createElement('button');
        dayBtn.className = 'day-btn';
        dayBtn.textContent = DAY_LABELS[i];
        dayBtn.title = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

        if (habit.completedDates.includes(dateKey)) dayBtn.classList.add('completed');
        if (dateKey === todayKey) dayBtn.classList.add('today');
        if (dateKey > todayKey) dayBtn.disabled = true; // Can't tick off the future

        dayBtn.addEventListener('click', () => toggleHabitDay(habit.id, dateKey));
        daysContainer.appendChild(dayBtn);
    });

    const streak = calculateStreak(habit);
    const streakSpan = document.createElement('span');
    streakSpan.className = 'habit-streak';
    streakSpan.textContent = `Current Streak: ${streak} ${streak === 1 ? 'day' : 'days'}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'habit-delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete habit';
    deleteBtn.addEventListener('click', () => deleteHabit(habit.id));

    row.append(nameSpan, daysContainer, streakSpan, deleteBtn);
    return row;
}

function renderHabits() {
    const weekDates = getCurrentWeekDates();
    const todayKey = toDateKey(new Date());

    habitList.innerHTML = '';
    habits.forEach(habit => habitList.appendChild(createHabitElement(habit, weekDates, todayKey)));
    habitEmpty.hidden = habits.length > 0;
}

addHabitBtn.addEventListener('click', addHabit);
newHabitInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') addHabit();
});

renderHabits();


// --- CALENDAR LOGIC ---
const calendarView = document.getElementById('calendar-view');
const calendarTitle = document.getElementById('calendar-title');
const prevPeriodBtn = document.getElementById('prev-period');
const nextPeriodBtn = document.getElementById('next-period');
const todayBtn = document.getElementById('today-btn');
const viewButtons = document.querySelectorAll('.view-btn');

const eventModal = document.getElementById('event-modal');
const dayPanel = document.getElementById('day-panel');
const dayPanelTitle = document.getElementById('day-panel-title');
const modalEventList = document.getElementById('modal-event-list');
const newEventBtn = document.getElementById('new-event-btn');

const eventPanel = document.getElementById('event-panel');
const eventPanelTitle = document.getElementById('event-panel-title');
const eventTitleInput = document.getElementById('event-title');
const eventDateInput = document.getElementById('event-date');
const eventAllDayInput = document.getElementById('event-all-day');
const eventTimeRow = document.getElementById('event-time-row');
const eventStartInput = document.getElementById('event-start');
const eventEndInput = document.getElementById('event-end');
const eventRepeatSelect = document.getElementById('event-repeat');
const repeatOptions = document.getElementById('repeat-options');
const repeatIntervalInput = document.getElementById('repeat-interval');
const repeatUnitLabel = document.getElementById('repeat-unit');
const repeatWeekdays = document.getElementById('repeat-weekdays');
const repeatEndTypeSelect = document.getElementById('repeat-end-type');
const repeatUntilInput = document.getElementById('repeat-until');
const repeatCountInput = document.getElementById('repeat-count');
const repeatCountLabel = document.getElementById('repeat-count-label');
const eventColors = document.getElementById('event-colors');
const eventLocationInput = document.getElementById('event-location');
const eventNotesInput = document.getElementById('event-notes');
const eventError = document.getElementById('event-error');
const scopePrompt = document.getElementById('scope-prompt');
const scopeQuestion = document.getElementById('scope-question');
const eventActions = document.getElementById('event-actions');
const deleteEventBtn = document.getElementById('delete-event-btn');
const cancelEventBtn = document.getElementById('cancel-event-btn');
const saveEventBtn = document.getElementById('save-event-btn');

const EVENTS_STORAGE_KEY = 'commandCenter.events';
const CALENDAR_VIEW_STORAGE_KEY = 'commandCenter.calendarView';
const MAX_EVENTS_SHOWN = 2; // Per month-view square, before collapsing into "+N" (more would overflow)
const DEFAULT_EVENT_MINUTES = 60;
const MIN_BLOCK_MINUTES = 30;   // Shortest an event is drawn in the time grid, so it stays readable
const DEFAULT_SCROLL_HOUR = 7;  // Day/week views open at 7 AM, or earlier if an event starts sooner
const EVENT_COLORS = ['indigo', 'sky', 'teal', 'amber', 'rose', 'slate'];
const REPEAT_UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, as Date.getDay() numbers
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Each event looks like:
// { id, date, time, endTime, text, location, notes, color,
//   repeat, interval, weekdays, endType, until, count, skipDates }
// - date: first occurrence (YYYY-MM-DD); time/endTime: 'HH:MM', or '' for all-day
// - repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly', every `interval` units
// - weekdays: Date.getDay() numbers for weekly repeats (empty = the start date's weekday)
// - endType: 'never' | 'on' (stops after `until`) | 'after' (`count` times; `until` holds the last date)
// - skipDates: single occurrences removed from a series
let events = loadEvents().map(normalizeEvent);
let calendarViewMode = loadCalendarView();
let focusDate = startOfToday();  // The view is built around this date
let selectedDateKey = null;      // Day open in the pop-up
let editingEvent = null;         // { id, occurrenceDate } being edited, or null for a new event
let openedFromDayPanel = false;  // Whether Cancel/Save should return to the day list
let scopeAction = null;          // 'save' or 'delete' while the "which events?" prompt is open
let pendingChanges = null;       // Form values waiting on that prompt
let formColor = 'indigo';
let formWeekdays = [];
let lastScroll = { key: null, top: 0 }; // Keeps the time grid's scroll position across re-renders

function loadEvents() {
    try {
        return JSON.parse(localStorage.getItem(EVENTS_STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveEvents() {
    try {
        localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
    } catch {
        // Storage unavailable - events still work until refresh
    }
}

function loadCalendarView() {
    try {
        const saved = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
        return ['day', 'week', 'month'].includes(saved) ? saved : 'month';
    } catch {
        return 'month';
    }
}

// Fill in defaults so events saved by older versions of the app keep working
function normalizeEvent(event) {
    return {
        id: event.id,
        date: event.date,
        time: event.time || '',
        endTime: event.endTime || '',
        text: event.text || '',
        location: event.location || '',
        notes: event.notes || '',
        color: EVENT_COLORS.includes(event.color) ? event.color : 'indigo',
        repeat: REPEAT_UNITS[event.repeat] ? event.repeat : 'none',
        interval: Math.max(1, parseInt(event.interval, 10) || 1),
        weekdays: Array.isArray(event.weekdays) ? event.weekdays : [],
        endType: ['on', 'after'].includes(event.endType) ? event.endType : 'never',
        until: event.until || '',
        count: Math.max(1, parseInt(event.count, 10) || 10),
        skipDates: Array.isArray(event.skipDates) ? event.skipDates : []
    };
}

function createEventId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneEvents() {
    return JSON.parse(JSON.stringify(events));
}

// --- Date helpers ---

// "2026-10-26" -> local Date for that day
function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Whole days since 1970, ignoring daylight saving shifts
function dayIndex(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
}

function addDays(dateKey, days) {
    const date = parseDateKey(dateKey);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
}

function mondayOf(dateKey) {
    const weekday = parseDateKey(dateKey).getDay();
    return addDays(dateKey, -((weekday + 6) % 7));
}

function formatShortDate(dateKey) {
    return parseDateKey(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// "14:30" -> 870
function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// 870 -> "14:30"
function minutesToTime(totalMinutes) {
    const clamped = Math.min(Math.max(totalMinutes, 0), 23 * 60 + 59);
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// "14:30" -> "2:30 PM", using the viewer's locale
function formatEventTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(2000, 0, 1, hours, minutes)
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatEventTimeRange(event) {
    if (!event.time) return 'All day';
    return event.endTime
        ? `${formatEventTime(event.time)} – ${formatEventTime(event.endTime)}`
        : formatEventTime(event.time);
}

function getEventEndMinutes(event) {
    const start = timeToMinutes(event.time);
    const end = event.endTime ? timeToMinutes(event.endTime) : start + DEFAULT_EVENT_MINUTES;
    return Math.min(end, 24 * 60);
}

// --- Repeat rules ---

function isRepeating(event) {
    return event.repeat !== 'none';
}

// Whether the repeat pattern lands on a day, before end dates and skipped days are considered
function matchesRepeatPattern(event, dateKey) {
    if (dateKey < event.date) return false;
    if (!isRepeating(event)) return dateKey === event.date;

    const start = parseDateKey(event.date);
    const day = parseDateKey(dateKey);
    const every = event.interval;

    switch (event.repeat) {
        case 'daily':
            return (dayIndex(dateKey) - dayIndex(event.date)) % every === 0;
        case 'weekly': {
            const weekdays = event.weekdays.length ? event.weekdays : [start.getDay()];
            if (!weekdays.includes(day.getDay())) return false;
            const weeksApart = (dayIndex(mondayOf(dateKey)) - dayIndex(mondayOf(event.date))) / 7;
            return weeksApart % every === 0;
        }
        case 'monthly': {
            // Days 29-31 skip months that don't have them
            if (day.getDate() !== start.getDate()) return false;
            const monthsApart = (day.getFullYear() - start.getFullYear()) * 12 + day.getMonth() - start.getMonth();
            return monthsApart % every === 0;
        }
        case 'yearly':
            return day.getDate() === start.getDate()
                && day.getMonth() === start.getMonth()
                && (day.getFullYear() - start.getFullYear()) % every === 0;
        default:
            return false;
    }
}

function occursOn(event, dateKey) {
    if (event.skipDates.includes(dateKey)) return false;
    if (isRepeating(event) && event.endType !== 'never' && event.until && dateKey > event.until) return false;
    return matchesRepeatPattern(event, dateKey);
}

// Date of the Nth occurrence, used to turn "ends after N times" into a last date
function findNthOccurrence(event, count) {
    let dateKey = event.date;
    let found = 0;
    for (let i = 0; i < 366 * 100; i++) { // Safety cap: 100 years
        if (matchesRepeatPattern(event, dateKey) && ++found === count) return dateKey;
        dateKey = addDays(dateKey, 1);
    }
    return dateKey;
}

// Keep `until` in step with the end rule after any change to an event
function finalizeRepeat(event) {
    if (!isRepeating(event) || event.endType === 'never') {
        event.until = '';
    } else if (event.endType === 'after') {
        event.until = findNthOccurrence(event, event.count);
    }
    return event;
}

// "Every 2 weeks on Mon, Wed · until Dec 31, 2026"
function describeRepeat(event) {
    if (!isRepeating(event)) return '';
    const unit = REPEAT_UNITS[event.repeat];
    let text = event.interval === 1 ? `Every ${unit}` : `Every ${event.interval} ${unit}s`;

    if (event.repeat === 'weekly' && event.weekdays.length) {
        text += ' on ' + WEEKDAY_ORDER
            .filter(day => event.weekdays.includes(day))
            .map(day => WEEKDAY_SHORT[day])
            .join(', ');
    }
    if (event.endType === 'after') text += ` · ${event.count} ${event.count === 1 ? 'time' : 'times'}`;
    if (event.endType === 'on' && event.until) text += ` · until ${formatShortDate(event.until)}`;
    return text;
}

// Events on one day: all-day ones first, then by start time
function getEventsForDate(dateKey) {
    return events
        .filter(e => occursOn(e, dateKey))
        .sort((a, b) => a.time.localeCompare(b.time));
}

// Tasks with a due date on this day, in the same order as the task list
function getTasksDueOn(dateKey) {
    return getSortedTasks().filter(task => task.dueDate === dateKey);
}

// --- Rendering: shared ---

function createEventChip(event) {
    const chip = document.createElement('div');
    chip.className = `day-event event-color-${event.color}`;
    const repeatMark = isRepeating(event) ? '↻ ' : '';
    const time = event.time ? `${formatEventTime(event.time)} ` : '';
    chip.textContent = `${repeatMark}${time}${event.text}`;
    return chip;
}

function createTaskChip(task) {
    const chip = document.createElement('div');
    chip.className = 'day-event day-task' + (task.completed ? ' completed' : '');
    chip.textContent = `${task.completed ? '☑' : '☐'} ${task.text}`;
    return chip;
}

function getVisibleDays() {
    const focusKey = toDateKey(focusDate);
    if (calendarViewMode === 'day') return [focusKey];
    const monday = mondayOf(focusKey);
    return WEEKDAY_ORDER.map((_, i) => addDays(monday, i));
}

function renderCalendarTitle() {
    if (calendarViewMode === 'month') {
        calendarTitle.textContent = focusDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (calendarViewMode === 'day') {
        calendarTitle.textContent = focusDate.toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
    } else {
        const days = getVisibleDays();
        const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const first = parseDateKey(days[0]);
        const last = parseDateKey(days[6]);
        calendarTitle.textContent = formatter.formatRange
            ? formatter.formatRange(first, last)
            : `${formatter.format(first)} – ${formatter.format(last)}`;
    }
}

function renderCalendar() {
    viewButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === calendarViewMode));
    calendarView.className = `calendar-view view-${calendarViewMode}`;
    renderCalendarTitle();

    // Remember where the time grid was scrolled, so re-rendering after an edit doesn't jump
    const oldScroll = calendarView.querySelector('.timegrid-scroll');
    if (oldScroll) lastScroll.top = oldScroll.scrollTop;

    calendarView.innerHTML = '';
    if (calendarViewMode === 'month') {
        renderMonthView();
    } else {
        renderTimeGridView(getVisibleDays());
    }
}

// --- Rendering: month view ---

function createDayBox(date, isOtherMonth, todayKey) {
    const dateKey = toDateKey(date);

    const dayBox = document.createElement('div');
    dayBox.className = 'day-box';
    if (isOtherMonth) dayBox.classList.add('other-month');
    if (dateKey === todayKey) dayBox.classList.add('today');

    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = date.getDate();
    dayBox.appendChild(dayNumber);

    // Tasks due that day share the chip slots with events, tasks first
    const chips = [
        ...getTasksDueOn(dateKey).map(createTaskChip),
        ...getEventsForDate(dateKey).map(createEventChip)
    ];
    chips.slice(0, MAX_EVENTS_SHOWN).forEach(chip => dayBox.appendChild(chip));

    if (chips.length > MAX_EVENTS_SHOWN) {
        const hidden = chips.length - MAX_EVENTS_SHOWN;
        const more = document.createElement('div');
        more.className = 'day-more';
        more.textContent = `+${hidden}`;
        more.title = `${hidden} more - click the day to see everything`;
        dayBox.appendChild(more);
    }

    dayBox.addEventListener('click', () => openDayPanel(dateKey));
    return dayBox;
}

function renderMonthView() {
    const year = focusDate.getFullYear();
    const month = focusDate.getMonth();
    const todayKey = toDateKey(new Date());

    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays';
    WEEKDAY_ORDER.forEach(day => {
        const label = document.createElement('span');
        label.textContent = WEEKDAY_SHORT[day];
        weekdays.appendChild(label);
    });

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    // Fill out whole weeks (Monday to Sunday) using days from the neighbouring months
    const lastOfMonth = new Date(year, month + 1, 0);
    const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
    const trailingDays = (7 - lastOfMonth.getDay()) % 7;
    const totalDays = leadingDays + lastOfMonth.getDate() + trailingDays;

    for (let i = 0; i < totalDays; i++) {
        const date = new Date(year, month, 1 - leadingDays + i);
        grid.appendChild(createDayBox(date, date.getMonth() !== month, todayKey));
    }

    calendarView.append(weekdays, grid);
}

// --- Rendering: day and week views (hourly time grid) ---

// Side-by-side layout for overlapping events: each gets a lane, and every event in an
// overlapping cluster shares the cluster's lane count so widths line up
function layoutTimedEvents(dayEvents) {
    const items = dayEvents
        .map(event => {
            const start = timeToMinutes(event.time);
            const end = Math.max(getEventEndMinutes(event), start + MIN_BLOCK_MINUTES);
            return { event, start, end, lane: 0, lanes: 1 };
        })
        .sort((a, b) => a.start - b.start || b.end - a.end);

    let cluster = [];
    let clusterEnd = -1;
    let laneEnds = [];
    const closeCluster = () => cluster.forEach(item => { item.lanes = laneEnds.length; });

    items.forEach(item => {
        if (cluster.length && item.start >= clusterEnd) {
            closeCluster();
            cluster = [];
            laneEnds = [];
            clusterEnd = -1;
        }
        let lane = laneEnds.findIndex(end => end <= item.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(item.end);
        } else {
            laneEnds[lane] = item.end;
        }
        item.lane = lane;
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
    });
    closeCluster();

    return items;
}

function createTimedEventBlock({ event, start, end, lane, lanes }, dateKey) {
    const block = document.createElement('div');
    block.className = `timegrid-event event-color-${event.color}`;
    block.style.top = `calc(var(--hour-height) * ${start / 60})`;
    block.style.height = `calc(var(--hour-height) * ${(end - start) / 60} - 2px)`;
    block.style.left = `calc(${(lane / lanes) * 100}% + 2px)`;
    block.style.width = `calc(${100 / lanes}% - 4px)`;

    const title = document.createElement('div');
    title.className = 'timegrid-event-title';
    title.textContent = (isRepeating(event) ? '↻ ' : '') + event.text;

    const meta = document.createElement('div');
    meta.className = 'timegrid-event-meta';
    meta.textContent = [formatEventTimeRange(event), event.location].filter(Boolean).join(' · ');

    block.append(title, meta);
    block.title = `${event.text}\n${meta.textContent}`;
    block.addEventListener('click', clickEvent => {
        clickEvent.stopPropagation(); // Don't also trigger "new event at this time"
        openEventEditor(event, dateKey, { fromDayPanel: false });
    });
    return block;
}

function renderTimeGridView(days) {
    const todayKey = toDateKey(new Date());
    const grid = document.createElement('div');
    grid.className = 'timegrid';
    grid.style.setProperty('--day-count', days.length);

    // Header: weekday + date for each column
    const header = document.createElement('div');
    header.className = 'timegrid-row timegrid-header';
    header.appendChild(document.createElement('div'));
    days.forEach(dateKey => {
        const date = parseDateKey(dateKey);
        const heading = document.createElement('button');
        heading.className = 'timegrid-day-heading' + (dateKey === todayKey ? ' today' : '');
        heading.textContent = WEEKDAY_SHORT[date.getDay()];
        const number = document.createElement('span');
        number.className = 'heading-number';
        number.textContent = date.getDate();
        heading.appendChild(number);
        heading.title = calendarViewMode === 'week' ? 'Open this day' : 'See everything on this day';
        heading.addEventListener('click', () => {
            if (calendarViewMode === 'week') {
                focusDate = date;
                setCalendarView('day');
            } else {
                openDayPanel(dateKey);
            }
        });
        header.appendChild(heading);
    });

    // All-day strip: tasks due and events without a time
    const allDay = document.createElement('div');
    allDay.className = 'timegrid-row timegrid-allday';
    const allDayLabel = document.createElement('div');
    allDayLabel.className = 'timegrid-gutter-label';
    allDayLabel.textContent = 'All day';
    allDay.appendChild(allDayLabel);
    days.forEach(dateKey => {
        const cell = document.createElement('div');
        cell.className = 'timegrid-allday-cell';
        getTasksDueOn(dateKey).forEach(task => cell.appendChild(createTaskChip(task)));
        getEventsForDate(dateKey).filter(e => !e.time).forEach(event => {
            const chip = createEventChip(event);
            chip.addEventListener('click', clickEvent => {
                clickEvent.stopPropagation();
                openEventEditor(event, dateKey, { fromDayPanel: false });
            });
            cell.appendChild(chip);
        });
        cell.addEventListener('click', () => openDayPanel(dateKey));
        allDay.appendChild(cell);
    });

    // Scrolling body: hour labels + one column per day
    const scroll = document.createElement('div');
    scroll.className = 'timegrid-scroll';
    const body = document.createElement('div');
    body.className = 'timegrid-row timegrid-body';

    const hours = document.createElement('div');
    hours.className = 'timegrid-hours';
    for (let hour = 1; hour < 24; hour++) {
        const label = document.createElement('span');
        label.className = 'timegrid-hour-label';
        label.style.top = `calc(var(--hour-height) * ${hour})`;
        label.textContent = formatEventTime(minutesToTime(hour * 60)).replace(':00', '');
        hours.appendChild(label);
    }
    body.appendChild(hours);

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    days.forEach(dateKey => {
        const column = document.createElement('div');
        column.className = 'timegrid-column' + (dateKey === todayKey ? ' today' : '');

        const timed = getEventsForDate(dateKey).filter(e => e.time);
        layoutTimedEvents(timed).forEach(item => column.appendChild(createTimedEventBlock(item, dateKey)));

        if (dateKey === todayKey) {
            const nowLine = document.createElement('div');
            nowLine.className = 'timegrid-now-line';
            nowLine.style.top = `calc(var(--hour-height) * ${nowMinutes / 60})`;
            column.appendChild(nowLine);
        }

        // Click an empty spot to add an event starting at that hour
        column.addEventListener('click', clickEvent => {
            const hourHeight = column.offsetHeight / 24;
            const offset = clickEvent.clientY - column.getBoundingClientRect().top;
            const hour = Math.min(23, Math.max(0, Math.floor(offset / hourHeight)));
            openEventEditor(null, dateKey, { fromDayPanel: false, startTime: minutesToTime(hour * 60) });
        });

        body.appendChild(column);
    });

    scroll.appendChild(body);
    grid.append(header, allDay, scroll);
    calendarView.appendChild(grid);

    // Same view and dates as before: keep the scroll position. Otherwise jump to a useful hour.
    // (Skipped while the calendar page is hidden, since nothing can be scrolled then.)
    if (scroll.offsetParent === null) return;
    const scrollKey = `${calendarViewMode}:${days[0]}`;
    if (lastScroll.key === scrollKey) {
        scroll.scrollTop = lastScroll.top;
    } else {
        // Open at whichever comes first: the earliest event shown, or an hour before now (7 AM on other days)
        const earliestEventHour = Math.min(...days.flatMap(dateKey =>
            getEventsForDate(dateKey).filter(e => e.time).map(e => Math.floor(timeToMinutes(e.time) / 60))
        ));
        const defaultHour = days.includes(todayKey) ? Math.max(0, now.getHours() - 1) : DEFAULT_SCROLL_HOUR;
        const startHour = Math.min(defaultHour, earliestEventHour);
        scroll.scrollTop = (body.offsetHeight / 24) * startHour;
        lastScroll = { key: scrollKey, top: scroll.scrollTop };
    }
}

// --- Navigation ---

function setCalendarView(mode) {
    calendarViewMode = mode;
    try {
        localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode);
    } catch {
        // Storage unavailable - view still changes until refresh
    }
    renderCalendar();
}

function shiftPeriod(direction) {
    if (calendarViewMode === 'month') {
        focusDate = new Date(focusDate.getFullYear(), focusDate.getMonth() + direction, 1);
    } else {
        const step = calendarViewMode === 'week' ? 7 : 1;
        focusDate = parseDateKey(addDays(toDateKey(focusDate), step * direction));
    }
    renderCalendar();
}

// --- Pop-up: day panel ---

function showPanel(panel) {
    dayPanel.hidden = panel !== 'day';
    eventPanel.hidden = panel !== 'event';
    eventModal.classList.remove('hidden');
}

function closeEventModal() {
    eventModal.classList.add('hidden');
    selectedDateKey = null;
    editingEvent = null;
    hideScopePrompt();
}

function createModalHeading(text) {
    const heading = document.createElement('li');
    heading.className = 'modal-section-heading';
    heading.textContent = text;
    return heading;
}

// A task due this day, with a checkbox that ticks it off in the task manager too
function createModalTaskItem(task) {
    const item = document.createElement('li');
    item.className = 'modal-event modal-task' + (task.completed ? ' completed' : '');

    const label = document.createElement('label');
    label.className = 'modal-task-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => {
        toggleTask(task.id);
        renderDayPanel();
        renderCalendar();
    });

    const text = document.createElement('span');
    text.textContent = task.text;

    label.append(checkbox, text);

    const badge = document.createElement('span');
    badge.className = `priority-badge priority-${task.priority}`;
    badge.textContent = task.priority;

    item.append(label, badge);
    return item;
}

// One event in the day list; click it to edit
function createModalEventItem(event) {
    const item = document.createElement('li');
    item.className = `modal-event clickable event-color-${event.color}`;
    item.title = 'Edit event';

    const main = document.createElement('div');
    main.className = 'modal-event-main';

    const dot = document.createElement('span');
    dot.className = 'event-color-dot';

    const text = document.createElement('div');
    text.className = 'modal-event-text';

    const title = document.createElement('div');
    title.className = 'modal-event-title';
    title.textContent = event.text;
    text.appendChild(title);

    [describeRepeat(event) && `↻ ${describeRepeat(event)}`, event.location && `📍 ${event.location}`, event.notes]
        .filter(Boolean)
        .forEach(line => {
            const meta = document.createElement('span');
            meta.className = 'modal-event-meta';
            meta.textContent = line;
            text.appendChild(meta);
        });

    main.append(dot, text);

    const time = document.createElement('span');
    time.className = 'modal-event-time';
    time.textContent = formatEventTimeRange(event);

    item.append(main, time);
    item.addEventListener('click', () => openEventEditor(event, selectedDateKey, { fromDayPanel: true }));
    return item;
}

function renderDayPanel() {
    dayPanelTitle.textContent = parseDateKey(selectedDateKey)
        .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const dayTasks = getTasksDueOn(selectedDateKey);
    const dayEvents = getEventsForDate(selectedDateKey);
    modalEventList.innerHTML = '';

    if (dayTasks.length === 0 && dayEvents.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'modal-empty';
        empty.textContent = 'Nothing planned yet.';
        modalEventList.appendChild(empty);
        return;
    }

    if (dayTasks.length > 0) {
        modalEventList.appendChild(createModalHeading('Tasks due'));
        dayTasks.forEach(task => modalEventList.appendChild(createModalTaskItem(task)));
        if (dayEvents.length > 0) modalEventList.appendChild(createModalHeading('Events'));
    }

    dayEvents.forEach(event => modalEventList.appendChild(createModalEventItem(event)));
}

function openDayPanel(dateKey) {
    selectedDateKey = dateKey;
    editingEvent = null;
    hideScopePrompt();
    renderDayPanel();
    showPanel('day');
}

// --- Pop-up: event editor ---

function renderColorPicker() {
    eventColors.innerHTML = '';
    EVENT_COLORS.forEach(color => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `event-color-${color}` + (color === formColor ? ' selected' : '');
        swatch.title = color[0].toUpperCase() + color.slice(1);
        swatch.addEventListener('click', () => {
            formColor = color;
            renderColorPicker();
        });
        eventColors.appendChild(swatch);
    });
}

function renderWeekdayPicker() {
    repeatWeekdays.innerHTML = '';
    WEEKDAY_ORDER.forEach(day => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = WEEKDAY_LETTER[day];
        button.title = WEEKDAY_SHORT[day];
        button.className = formWeekdays.includes(day) ? 'selected' : '';
        button.addEventListener('click', () => {
            if (formWeekdays.includes(day)) {
                if (formWeekdays.length > 1) formWeekdays = formWeekdays.filter(d => d !== day); // Keep at least one
            } else {
                formWeekdays = [...formWeekdays, day];
            }
            renderWeekdayPicker();
        });
        repeatWeekdays.appendChild(button);
    });
}

// Show only the controls that apply to the current choices
function syncEventFormVisibility() {
    eventTimeRow.hidden = eventAllDayInput.checked;

    const repeat = eventRepeatSelect.value;
    repeatOptions.hidden = repeat === 'none';
    if (repeat !== 'none') {
        const interval = parseInt(repeatIntervalInput.value, 10) || 1;
        repeatUnitLabel.textContent = REPEAT_UNITS[repeat] + (interval === 1 ? '' : 's');
    }

    repeatWeekdays.hidden = repeat !== 'weekly';
    if (repeat === 'weekly' && formWeekdays.length === 0 && eventDateInput.value) {
        formWeekdays = [parseDateKey(eventDateInput.value).getDay()];
    }
    if (repeat === 'weekly') renderWeekdayPicker();

    const endType = repeatEndTypeSelect.value;
    repeatUntilInput.hidden = endType !== 'on';
    repeatCountInput.hidden = endType !== 'after';
    repeatCountLabel.hidden = endType !== 'after';
}

function showEventError(message) {
    eventError.textContent = message;
    eventError.hidden = !message;
}

// options: { fromDayPanel, startTime }
function openEventEditor(event, dateKey, options = {}) {
    selectedDateKey = dateKey;
    openedFromDayPanel = Boolean(options.fromDayPanel);
    editingEvent = event ? { id: event.id, occurrenceDate: dateKey } : null;
    hideScopePrompt();
    showEventError('');

    eventPanelTitle.textContent = event ? 'Edit Event' : 'New Event';
    deleteEventBtn.hidden = !event;
    cancelEventBtn.textContent = openedFromDayPanel ? 'Back' : 'Cancel';

    eventTitleInput.value = event ? event.text : '';
    // For a repeating event, the date shown is the occurrence that was clicked
    eventDateInput.value = dateKey;

    const startTime = event ? event.time : (options.startTime || '');
    eventAllDayInput.checked = event ? !event.time : !options.startTime;
    eventStartInput.value = startTime || '09:00';
    eventEndInput.value = event
        ? (event.endTime || (event.time ? minutesToTime(timeToMinutes(event.time) + DEFAULT_EVENT_MINUTES) : '10:00'))
        : minutesToTime(timeToMinutes(startTime || '09:00') + DEFAULT_EVENT_MINUTES);

    eventRepeatSelect.value = event ? event.repeat : 'none';
    repeatIntervalInput.value = event ? event.interval : 1;
    formWeekdays = event ? [...event.weekdays] : [];
    repeatEndTypeSelect.value = event ? event.endType : 'never';
    repeatUntilInput.value = event && event.endType === 'on' ? event.until : '';
    repeatCountInput.value = event ? event.count : 10;

    formColor = event ? event.color : 'indigo';
    eventLocationInput.value = event ? event.location : '';
    eventNotesInput.value = event ? event.notes : '';

    renderColorPicker();
    syncEventFormVisibility();
    showPanel('event');
    eventTitleInput.focus();
}

// Read and check the form; returns { fields } or { error }
function readEventForm() {
    const text = eventTitleInput.value.trim();
    const date = eventDateInput.value;
    const allDay = eventAllDayInput.checked;
    const time = allDay ? '' : eventStartInput.value;
    const endTime = allDay ? '' : eventEndInput.value;
    const repeat = eventRepeatSelect.value;
    const endType = repeat === 'none' ? 'never' : repeatEndTypeSelect.value;

    if (!text) return { error: 'Give the event a title.' };
    if (!date) return { error: 'Pick a date.' };
    if (!allDay && !time) return { error: 'Pick a start time, or tick "All day".' };
    if (endTime && endTime <= time) return { error: 'The end time needs to be after the start time.' };
    if (endType === 'on' && !repeatUntilInput.value) return { error: 'Pick the date the event stops repeating.' };
    if (endType === 'on' && repeatUntilInput.value < date) {
        return { error: 'The repeat end date must be on or after the event date.' };
    }

    return {
        fields: {
            text,
            date,
            time,
            endTime,
            location: eventLocationInput.value.trim(),
            notes: eventNotesInput.value.trim(),
            color: formColor,
            repeat,
            interval: Math.min(99, Math.max(1, parseInt(repeatIntervalInput.value, 10) || 1)),
            weekdays: repeat === 'weekly' ? [...formWeekdays] : [],
            endType,
            until: endType === 'on' ? repeatUntilInput.value : '',
            count: Math.min(999, Math.max(1, parseInt(repeatCountInput.value, 10) || 1))
        }
    };
}

function createEvent(fields) {
    return finalizeRepeat(normalizeEvent({ ...fields, id: createEventId(), skipDates: [] }));
}

function showScopePrompt(action) {
    scopeAction = action;
    scopeQuestion.textContent = action === 'save'
        ? 'This is a repeating event. Change which events?'
        : 'This is a repeating event. Delete which events?';
    scopePrompt.hidden = false;
    eventActions.hidden = true;
}

function hideScopePrompt() {
    scopeAction = null;
    pendingChanges = null;
    scopePrompt.hidden = true;
    eventActions.hidden = false;
}

// After a change: save, redraw, and offer Undo
function commitEventChange(snapshot, message, returnDate) {
    saveEvents();
    renderCalendar();

    if (openedFromDayPanel && returnDate) {
        openDayPanel(returnDate);
    } else {
        closeEventModal();
    }

    showUndoToast(message, () => {
        events = snapshot;
        saveEvents();
        renderCalendar();
        if (!eventModal.classList.contains('hidden') && !dayPanel.hidden && selectedDateKey) renderDayPanel();
    });
}

function saveEventFromForm() {
    const { fields, error } = readEventForm();
    if (error) {
        showEventError(error);
        return;
    }
    showEventError('');

    if (!editingEvent) {
        const snapshot = cloneEvents();
        events.push(createEvent(fields));
        commitEventChange(snapshot, 'Event added', fields.date);
        return;
    }

    const original = events.find(e => e.id === editingEvent.id);
    if (isRepeating(original)) {
        pendingChanges = fields;
        showScopePrompt('save');
        return;
    }
    applyEventEdit(original, fields, 'all');
}

// scope: 'one' (just this occurrence), 'following' (this one onward) or 'all'
function applyEventEdit(original, fields, scope) {
    const snapshot = cloneEvents();
    const occurrence = editingEvent.occurrenceDate;

    if (scope === 'following' && occurrence === original.date) scope = 'all';

    if (scope === 'all') {
        // Moving one occurrence's date moves the whole series by the same number of days
        const shift = dayIndex(fields.date) - dayIndex(isRepeating(original) ? occurrence : original.date);
        const keepsRepeating = isRepeating(original) && fields.repeat !== 'none';
        const newStart = keepsRepeating ? addDays(original.date, shift) : fields.date;
        Object.assign(original, fields, {
            date: newStart,
            skipDates: keepsRepeating ? original.skipDates.map(d => addDays(d, shift)) : []
        });
        if (fields.endType === 'on' && fields.until < newStart) original.until = newStart;
        finalizeRepeat(original);
    } else if (scope === 'one') {
        // Lift this day out of the series and give it its own one-off event
        original.skipDates.push(occurrence);
        events.push(createEvent({ ...fields, repeat: 'none' }));
    } else {
        // End the old series the day before, and start a new one from here with the changes
        const newSeries = createEvent(fields);
        const endRuleUnchanged = fields.endType === original.endType && fields.count === original.count;
        if (original.endType === 'after' && endRuleUnchanged) {
            // Keep the series finishing on the same day rather than restarting the count
            newSeries.endType = 'on';
            newSeries.until = original.until;
        }
        original.endType = 'on';
        original.until = addDays(occurrence, -1);
        events.push(newSeries);
    }

    commitEventChange(snapshot, 'Event updated', fields.date);
}

function requestDeleteEvent() {
    const original = events.find(e => e.id === editingEvent.id);
    if (isRepeating(original)) {
        showScopePrompt('delete');
    } else {
        deleteEventWithScope(original, 'all');
    }
}

function deleteEventWithScope(original, scope) {
    const snapshot = cloneEvents();
    const occurrence = editingEvent.occurrenceDate;

    if (scope === 'following' && occurrence === original.date) scope = 'all';

    if (scope === 'one') {
        original.skipDates.push(occurrence);
    } else if (scope === 'following') {
        original.endType = 'on';
        original.until = addDays(occurrence, -1);
    } else {
        events = events.filter(e => e.id !== original.id);
    }

    const message = scope === 'one' ? 'Event removed from this day' : 'Event deleted';
    commitEventChange(snapshot, message, occurrence);
}

function handleScopeChoice(scope) {
    if (scope === 'cancel') {
        hideScopePrompt();
        return;
    }
    const original = events.find(e => e.id === editingEvent.id);
    const action = scopeAction;
    const changes = pendingChanges;
    hideScopePrompt();

    if (action === 'save') {
        applyEventEdit(original, changes, scope);
    } else {
        deleteEventWithScope(original, scope);
    }
}

// --- Wiring ---

viewButtons.forEach(button => button.addEventListener('click', () => setCalendarView(button.dataset.view)));
prevPeriodBtn.addEventListener('click', () => shiftPeriod(-1));
nextPeriodBtn.addEventListener('click', () => shiftPeriod(1));
todayBtn.addEventListener('click', () => {
    focusDate = startOfToday();
    renderCalendar();
});

newEventBtn.addEventListener('click', () => openEventEditor(null, selectedDateKey, { fromDayPanel: true }));
document.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', closeEventModal));
cancelEventBtn.addEventListener('click', () => {
    if (openedFromDayPanel) {
        openDayPanel(selectedDateKey);
    } else {
        closeEventModal();
    }
});
saveEventBtn.addEventListener('click', saveEventFromForm);
deleteEventBtn.addEventListener('click', requestDeleteEvent);
scopePrompt.querySelectorAll('[data-scope]').forEach(button => {
    button.addEventListener('click', () => handleScopeChoice(button.dataset.scope));
});

eventTitleInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveEventFromForm();
});
eventAllDayInput.addEventListener('change', syncEventFormVisibility);
eventRepeatSelect.addEventListener('change', syncEventFormVisibility);
repeatIntervalInput.addEventListener('input', syncEventFormVisibility);
repeatEndTypeSelect.addEventListener('change', syncEventFormVisibility);
eventDateInput.addEventListener('change', () => {
    // A new weekly event follows its date's weekday until days are picked by hand
    if (!editingEvent && eventRepeatSelect.value === 'weekly' && formWeekdays.length === 1 && eventDateInput.value) {
        formWeekdays = [parseDateKey(eventDateInput.value).getDay()];
        renderWeekdayPicker();
    }
});
// Moving the start keeps the event's length, like most calendar apps
let previousStartTime = null;
eventStartInput.addEventListener('focus', () => { previousStartTime = eventStartInput.value; });
eventStartInput.addEventListener('change', () => {
    if (!eventStartInput.value) return;
    const length = previousStartTime && eventEndInput.value
        ? timeToMinutes(eventEndInput.value) - timeToMinutes(previousStartTime)
        : DEFAULT_EVENT_MINUTES;
    eventEndInput.value = minutesToTime(timeToMinutes(eventStartInput.value) + Math.max(length, 15));
    previousStartTime = eventStartInput.value;
});

// Clicking the dark backdrop (but not the box itself) or pressing Escape closes the pop-up
eventModal.addEventListener('click', event => {
    if (event.target === eventModal) closeEventModal();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !eventModal.classList.contains('hidden')) closeEventModal();
});

// Keep the red "now" line moving in day/week views
setInterval(() => {
    const calendarVisible = document.getElementById('calendar-page').classList.contains('active-page');
    if (calendarVisible && calendarViewMode !== 'month') renderCalendar();
}, 60 * 1000);

renderCalendar();


// --- DASHBOARD GREETING LOGIC ---
const greetingHeading = document.getElementById('dynamic-greeting');
const daySummary = document.getElementById('day-summary');

const userNameBtn = document.getElementById('user-name-btn');
const userNameInput = document.getElementById('user-name-input');

const USER_NAME_STORAGE_KEY = 'commandCenter.userName';
const DEFAULT_USER_NAME = 'User';
const MAX_TASKS_IN_SUMMARY = 3;

function getUserName() {
    return localStorage.getItem(USER_NAME_STORAGE_KEY) || DEFAULT_USER_NAME;
}

// Click the name in the greeting to type a new one; Enter or clicking away saves, Escape cancels
userNameBtn.addEventListener('click', () => {
    userNameInput.value = getUserName() === DEFAULT_USER_NAME ? '' : getUserName();
    userNameInput.placeholder = DEFAULT_USER_NAME;
    userNameInput.size = Math.max(userNameInput.value.length, DEFAULT_USER_NAME.length) + 1;
    userNameBtn.hidden = true;
    userNameInput.hidden = false;
    userNameInput.focus();
});

userNameInput.addEventListener('input', () => {
    userNameInput.size = Math.max(userNameInput.value.length, DEFAULT_USER_NAME.length) + 1;
});

function finishEditingName(save) {
    if (userNameInput.hidden) return;
    if (save) {
        const name = userNameInput.value.trim();
        if (name) localStorage.setItem(USER_NAME_STORAGE_KEY, name);
        else localStorage.removeItem(USER_NAME_STORAGE_KEY);
    }
    userNameInput.hidden = true;
    userNameBtn.hidden = false;
    userNameBtn.textContent = getUserName();
    userNameBtn.focus();
}

userNameInput.addEventListener('keydown', (e) => {
    // preventDefault keeps Enter from also "clicking" the name button once it has focus again
    if (e.key === 'Enter') { e.preventDefault(); finishEditingName(true); }
    if (e.key === 'Escape') finishEditingName(false);
});
userNameInput.addEventListener('blur', () => finishEditingName(true));
const listFormatter = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' });

function getGreeting(hour) {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

// Build the summary from today's calendar events and unfinished high-priority tasks
function renderDashboard() {
    const now = new Date();
    greetingHeading.textContent = getGreeting(now.getHours());
    userNameBtn.textContent = getUserName();

    const todaysEvents = getEventsForDate(toDateKey(now))
        .map(e => e.time ? `${e.text} at ${formatEventTime(e.time)}` : e.text);

    // High-priority tasks, plus anything due today or overdue
    const todayKey = toDateKey(now);
    const urgentTasks = getSortedTasks()
        .filter(t => !t.completed && (t.priority === 'high' || (t.dueDate && t.dueDate <= todayKey)))
        .map(t => t.text);

    const sentences = [];

    if (todaysEvents.length > 0) {
        sentences.push(`You have ${listFormatter.format(todaysEvents)} today.`);
    }

    if (urgentTasks.length > 0) {
        const shown = urgentTasks.slice(0, MAX_TASKS_IN_SUMMARY);
        const extra = urgentTasks.length - shown.length;
        if (extra > 0) shown.push(`${extra} other ${extra === 1 ? 'task' : 'tasks'}`);

        const opener = todaysEvents.length > 0 ? 'Also, it' : 'It';
        sentences.push(`${opener} looks like you wanted to get ${listFormatter.format(shown)} done.`);
    }

    if (sentences.length === 0) {
        sentences.push('Nothing on the calendar today and nothing urgent on your task list. Enjoy the clear day!');
    }

    daySummary.textContent = sentences.join(' ');
}

// Keep the greeting current as the day moves from morning to afternoon to evening
setInterval(renderDashboard, 60 * 1000);
renderDashboard();


// --- WEATHER WIDGET LOGIC ---
// Forecast from Open-Meteo (free, no API key needed)
const weatherIcon = document.getElementById('weather-icon');
const weatherTemp = document.getElementById('weather-temp');
const weatherCondition = document.getElementById('weather-condition');
const weatherForecast = document.getElementById('weather-forecast');
const weatherUpdated = document.getElementById('weather-updated');
const weatherHourlyBtn = document.getElementById('weather-hourly-btn');
const weatherDailyBtn = document.getElementById('weather-daily-btn');
const refreshWeatherBtn = document.getElementById('refresh-weather-btn');

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=38.627&longitude=-90.1994' // St. Louis, MO
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
    + '&hourly=temperature_2m,weather_code,is_day'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
    + '&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=7';
const HOURS_SHOWN = 12;
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

let weatherData = null;       // Last successful API response
let forecastView = 'hourly';  // 'hourly' or 'daily'

// WMO weather codes used by Open-Meteo -> label and emoji
function describeWeather(code, isDay = true) {
    if (code === 0) return { label: 'Clear', icon: isDay ? '☀️' : '🌙' };
    if (code === 1) return { label: 'Mainly clear', icon: isDay ? '🌤️' : '🌙' };
    if (code === 2) return { label: 'Partly cloudy', icon: isDay ? '⛅' : '☁️' };
    if (code === 3) return { label: 'Overcast', icon: '☁️' };
    if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️' };
    if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' };
    if (code >= 61 && code <= 67) return { label: 'Rain', icon: '🌧️' };
    if (code >= 71 && code <= 77) return { label: 'Snow', icon: '🌨️' };
    if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: '🌦️' };
    if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' };
    if (code >= 95) return { label: 'Thunderstorm', icon: '⛈️' };
    return { label: 'Unknown', icon: '🌡️' };
}

// "2026-10-26T14:00" -> "2 PM" (the API already returns St. Louis local time)
function formatForecastHour(time) {
    const hour = parseInt(time.slice(11, 13), 10);
    const suffix = hour < 12 ? 'AM' : 'PM';
    return `${hour % 12 || 12} ${suffix}`;
}

function createForecastItem(label, icon, temp, low) {
    const item = document.createElement('li');
    item.className = 'forecast-item';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'forecast-label';
    labelDiv.textContent = label;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'forecast-icon';
    iconDiv.textContent = icon;

    const tempDiv = document.createElement('div');
    tempDiv.className = 'forecast-temp';
    tempDiv.textContent = `${temp}°`;
    if (low !== undefined) {
        const lowSpan = document.createElement('span');
        lowSpan.className = 'forecast-low';
        lowSpan.textContent = ` ${low}°`;
        tempDiv.appendChild(lowSpan);
    }

    item.append(labelDiv, iconDiv, tempDiv);
    return item;
}

function renderForecast() {
    weatherForecast.innerHTML = '';
    weatherHourlyBtn.classList.toggle('active', forecastView === 'hourly');
    weatherDailyBtn.classList.toggle('active', forecastView === 'daily');
    if (!weatherData) return;

    if (forecastView === 'hourly') {
        const { time, temperature_2m, weather_code, is_day } = weatherData.hourly;
        // Start at the current hour, e.g. "2026-10-26T14" for 2:15 PM
        const currentHour = weatherData.current.time.slice(0, 13);
        const start = Math.max(0, time.findIndex(t => t.slice(0, 13) >= currentHour));

        for (let i = start; i < Math.min(start + HOURS_SHOWN, time.length); i++) {
            const { icon } = describeWeather(weather_code[i], is_day[i] === 1);
            const label = i === start ? 'Now' : formatForecastHour(time[i]);
            weatherForecast.appendChild(createForecastItem(label, icon, Math.round(temperature_2m[i])));
        }
    } else {
        const { time, weather_code, temperature_2m_max, temperature_2m_min } = weatherData.daily;
        time.forEach((day, i) => {
            const label = i === 0
                ? 'Today'
                : parseDateKey(day).toLocaleDateString(undefined, { weekday: 'short' });
            const { icon } = describeWeather(weather_code[i]);
            weatherForecast.appendChild(createForecastItem(
                label, icon, Math.round(temperature_2m_max[i]), Math.round(temperature_2m_min[i])
            ));
        });
    }
}

function renderWeather() {
    const { current, daily } = weatherData;
    const { label, icon } = describeWeather(current.weather_code, current.is_day === 1);
    const high = Math.round(daily.temperature_2m_max[0]);
    const low = Math.round(daily.temperature_2m_min[0]);

    weatherIcon.textContent = icon;
    weatherTemp.textContent = `${Math.round(current.temperature_2m)}°F`;
    weatherCondition.textContent =
        `${label} · Feels like ${Math.round(current.apparent_temperature)}° · H ${high}° L ${low}°`;
    weatherUpdated.textContent = 'Updated ' + new Date()
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    renderForecast();
}

async function fetchWeather() {
    refreshWeatherBtn.disabled = true;
    refreshWeatherBtn.textContent = 'Loading...';

    try {
        const response = await fetch(WEATHER_URL);
        if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
        weatherData = await response.json();
        renderWeather();
    } catch (error) {
        console.error(error);
        // Keep showing the last good forecast if there is one
        weatherUpdated.textContent = "Couldn't reach the weather service";
        if (!weatherData) {
            weatherIcon.textContent = '⚠️';
            weatherCondition.textContent = 'Weather unavailable - check your connection and hit Refresh.';
        }
    } finally {
        refreshWeatherBtn.disabled = false;
        refreshWeatherBtn.textContent = 'Refresh';
    }
}

weatherHourlyBtn.addEventListener('click', () => {
    forecastView = 'hourly';
    renderForecast();
});
weatherDailyBtn.addEventListener('click', () => {
    forecastView = 'daily';
    renderForecast();
});
refreshWeatherBtn.addEventListener('click', fetchWeather);

setInterval(fetchWeather, WEATHER_REFRESH_MS);
fetchWeather();


// --- QUICK NOTES LOGIC ---
const noteTitleInput = document.getElementById('note-title');
const notepadArea = document.getElementById('notepad-area');
const exportDocBtn = document.getElementById('export-doc');
const exportPdfBtn = document.getElementById('export-pdf');
const noteStatus = document.getElementById('note-status');

const NOTE_STORAGE_KEY = 'commandCenter.note';
const DEFAULT_NOTE_TITLE = 'Quick Notes';

// Restore the note from last time, and save it as you type
try {
    const savedNote = JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY));
    if (savedNote) {
        noteTitleInput.value = savedNote.title;
        notepadArea.value = savedNote.body;
    }
} catch {
    // Storage unavailable - start with a blank note
}

function saveNote() {
    try {
        localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify({
            title: noteTitleInput.value,
            body: notepadArea.value
        }));
    } catch {
        // Storage unavailable - the note still works until refresh
    }
}

noteTitleInput.addEventListener('input', saveNote);
notepadArea.addEventListener('input', saveNote);

function showNoteStatus(message) {
    noteStatus.textContent = message;
}

function getNoteTitle() {
    return noteTitleInput.value.trim() || DEFAULT_NOTE_TITLE;
}

// Turn the note title into a safe file name, e.g. "Q4 plan: draft" -> "Q4 plan draft"
function getNoteFileName(extension) {
    const safeName = getNoteTitle().replace(/[^\w\s-]/g, '').trim() || DEFAULT_NOTE_TITLE;
    return `${safeName}.${extension}`;
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Word opens HTML saved with a .doc extension, so no library is needed
function exportToWord() {
    if (!notepadArea.value.trim()) {
        showNoteStatus('Nothing to export yet.');
        return;
    }

    const title = escapeHtml(getNoteTitle());
    const paragraphs = notepadArea.value
        .split('\n')
        .map(line => `<p>${line.trim() ? escapeHtml(line) : '&nbsp;'}</p>`)
        .join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
        + `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
        + `<head><meta charset="utf-8"><title>${title}</title></head>`
        + `<body style="font-family: Calibri, Arial, sans-serif;"><h1>${title}</h1>${paragraphs}</body></html>`;

    // The leading ﻿ (byte order mark) makes Word read the file as UTF-8
    downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), getNoteFileName('doc'));
    showNoteStatus('Downloaded ' + getNoteFileName('doc'));
}

function exportToPdf() {
    if (!notepadArea.value.trim()) {
        showNoteStatus('Nothing to export yet.');
        return;
    }
    if (!window.jspdf) {
        showNoteStatus("PDF export couldn't load - check your internet connection and refresh.");
        return;
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    const margin = 54; // 0.75 inch
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const pageBottom = doc.internal.pageSize.getHeight() - margin;
    const lineHeight = 16;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.splitTextToSize(getNoteTitle(), pageWidth).forEach(line => {
        doc.text(line, margin, y + 14);
        y += 26;
    });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.splitTextToSize(notepadArea.value, pageWidth).forEach(line => {
        if (y + lineHeight > pageBottom) {
            doc.addPage();
            y = margin;
        }
        doc.text(line, margin, y + 12);
        y += lineHeight;
    });

    doc.save(getNoteFileName('pdf'));
    showNoteStatus('Downloaded ' + getNoteFileName('pdf'));
}

exportDocBtn.addEventListener('click', exportToWord);
exportPdfBtn.addEventListener('click', exportToPdf);


// --- THEME (LIGHT / DARK) ---
const themeButtons = document.querySelectorAll('.theme-btn');
const THEME_STORAGE_KEY = 'commandCenter.theme';
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getThemeChoice() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    } catch {
        return 'system';
    }
}

// 'system' follows the Mac's appearance setting; 'light'/'dark' override it
function applyTheme(choice) {
    const isDark = choice === 'dark' || (choice === 'system' && systemDarkQuery.matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.themeChoice === choice));
}

themeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const choice = button.dataset.themeChoice;
        try {
            localStorage.setItem(THEME_STORAGE_KEY, choice);
        } catch {
            // Storage unavailable - theme still changes until refresh
        }
        applyTheme(choice);
    });
});

// If set to System, switch live when the Mac flips between light and dark
systemDarkQuery.addEventListener('change', () => applyTheme(getThemeChoice()));

applyTheme(getThemeChoice());


// --- BACKUP & RESTORE ---
const exportDataBtn = document.getElementById('export-data-btn');
const importDataInput = document.getElementById('import-data-input');
const importConfirm = document.getElementById('import-confirm');
const importConfirmMessage = document.getElementById('import-confirm-message');
const importConfirmBtn = document.getElementById('import-confirm-btn');
const importCancelBtn = document.getElementById('import-cancel-btn');
const backupStatus = document.getElementById('backup-status');

const BACKUP_APP_ID = 'personal-command-center';
let pendingBackup = null; // Parsed backup file waiting for the user to confirm

function exportBackup() {
    const backup = {
        app: BACKUP_APP_ID,
        version: 1,
        exportedAt: new Date().toISOString(),
        tasks,
        habits,
        events,
        note: { title: noteTitleInput.value, body: notepadArea.value }
    };

    const fileName = `command-center-backup-${toDateKey(new Date())}.json`;
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), fileName);
    backupStatus.textContent = `Downloaded ${fileName}`;
}

function countLabel(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Read the chosen file and ask for confirmation before replacing anything
async function handleBackupFile() {
    const file = importDataInput.files[0];
    importDataInput.value = ''; // Lets the same file be picked again later
    if (!file) return;

    try {
        const backup = JSON.parse(await file.text());
        if (backup.app !== BACKUP_APP_ID) throw new Error('Not a Command Center backup');

        pendingBackup = {
            tasks: Array.isArray(backup.tasks) ? backup.tasks : [],
            habits: Array.isArray(backup.habits) ? backup.habits : [],
            events: Array.isArray(backup.events) ? backup.events : [],
            note: backup.note && typeof backup.note === 'object' ? backup.note : { title: '', body: '' }
        };

        const exportedOn = backup.exportedAt
            ? new Date(backup.exportedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
            : 'an unknown date';
        importConfirmMessage.textContent =
            `This backup from ${exportedOn} has ${countLabel(pendingBackup.tasks.length, 'task')}, `
            + `${countLabel(pendingBackup.habits.length, 'habit')} and ${countLabel(pendingBackup.events.length, 'event')}. `
            + 'Restoring it will replace everything currently in the app.';
        importConfirm.hidden = false;
        backupStatus.textContent = '';
    } catch (error) {
        console.error(error);
        pendingBackup = null;
        importConfirm.hidden = true;
        backupStatus.textContent = "That file isn't a Command Center backup.";
    }
}

function restoreBackup() {
    if (!pendingBackup) return;

    tasks = pendingBackup.tasks;
    habits = pendingBackup.habits;
    events = pendingBackup.events.map(normalizeEvent);
    noteTitleInput.value = pendingBackup.note.title || '';
    notepadArea.value = pendingBackup.note.body || '';

    saveTasks();
    saveHabits();
    saveEvents();
    saveNote();
    renderTasks();
    renderHabits();
    renderCalendar();
    renderDashboard();

    pendingBackup = null;
    importConfirm.hidden = true;
    backupStatus.textContent = 'Backup restored.';
}

exportDataBtn.addEventListener('click', exportBackup);
importDataInput.addEventListener('change', handleBackupFile);
importConfirmBtn.addEventListener('click', restoreBackup);
importCancelBtn.addEventListener('click', () => {
    pendingBackup = null;
    importConfirm.hidden = true;
    backupStatus.textContent = 'Restore cancelled - nothing was changed.';
});
