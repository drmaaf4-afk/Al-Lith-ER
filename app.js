const supabaseClient = supabase.createClient(
  'https://incyqbermouxcrusmzby.supabase.co',
  'sb_publishable_l003s4eZYDjpXjrqft_2VQ_ECLSe5bs'
);

const TIMES = ['08-12','12-16','16-20','20-24','00-04','04-08'];
const MAX_MONTHLY_HOURS = 208;
const SHIFT_HOURS = 4;
const MAX_MONTHLY_SHIFTS = MAX_MONTHLY_HOURS / SHIFT_HOURS;

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const MONTH_OPTIONS = [];
const today = new Date();

for(let i = 0; i < 4; i++){
  const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
  MONTH_OPTIONS.push({
    year: d.getFullYear(),
    monthIndex: d.getMonth(),
    value: `${d.getFullYear()}-${d.getMonth()}`,
    label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
  });
}

let selectedYear = MONTH_OPTIONS[0].year;
let selectedMonthIndex = MONTH_OPTIONS[0].monthIndex;

const savedYear = Number(localStorage.getItem('selectedYear'));
const savedMonthIndex = Number(localStorage.getItem('selectedMonthIndex'));

const savedAllowed = MONTH_OPTIONS.some(
  m => m.year === savedYear && m.monthIndex === savedMonthIndex
);

if(savedAllowed){
  selectedYear = savedYear;
  selectedMonthIndex = savedMonthIndex;
}

let allBookings = [];
let currentDoctor = null;
let currentEmail = null;
let currentIsAdmin = false;
let realtimeStarted = false;
let allDoctors = [];
let openDays = JSON.parse(localStorage.getItem('openDays') || '{}');
let toastTimer = null;

function escapeHtml(text){
  return String(text)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function showToast(message, type = 'ok'){
  let toast = document.getElementById('toast');

  if(!toast){
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.className = `toast ${type}`;
  toast.textContent = message;

  clearTimeout(toastTimer);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function getCurrentMonthName(){
  return MONTH_NAMES[selectedMonthIndex];
}

function getCurrentMonthLabel(){
  return `${getCurrentMonthName()} ${selectedYear}`;
}

function getDaysInSelectedMonth(){
  return new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
}

function getCurrentDaysArray(){
  return Array.from({ length: getDaysInSelectedMonth() }, (_, i) => i + 1);
}

function saveMonthSelection(){
  localStorage.setItem('selectedYear', String(selectedYear));
  localStorage.setItem('selectedMonthIndex', String(selectedMonthIndex));
}

function saveOpenDays(){
  localStorage.setItem('openDays', JSON.stringify(openDays));
}

function updateTitles(){
  const headerSub = document.getElementById('headerSub');
  const mainTitle = document.getElementById('mainTitle');
  const pageTitle = document.getElementById('pageTitle');

  if(headerSub) headerSub.textContent = `Doctor Duty Planner - ${getCurrentMonthLabel()}`;
  if(mainTitle) mainTitle.textContent = `Hospital Duty Planner - ${getCurrentMonthLabel()}`;
  if(pageTitle) pageTitle.textContent = getCurrentMonthLabel();
}

function renderMonthSelector(){
  const el = document.getElementById('monthSelect');
  if(!el) return;

  el.innerHTML = MONTH_OPTIONS.map(month => `
    <option value="${month.value}" ${month.year === selectedYear && month.monthIndex === selectedMonthIndex ? 'selected' : ''}>
      ${escapeHtml(month.label)}
    </option>
  `).join('');
}

async function handleMonthDropdownChange(){
  const el = document.getElementById('monthSelect');
  if(!el) return;

  const [year, monthIndex] = el.value.split('-').map(Number);
  await selectMonth(year, monthIndex);
}

async function selectMonth(year, monthIndex){
  selectedYear = Number(year);
  selectedMonthIndex = Number(monthIndex);
  saveMonthSelection();
  openDays = { 1: true };
  saveOpenDays();
  updateTitles();
  renderMonthSelector();
  populateAdminSelectors();
  await loadBookings();

  const msg = `Switched to ${getCurrentMonthLabel()}.`;
  setPlannerStatus(msg);
  showToast(msg, 'info');
}

function toggleSummary(){
  const el = document.getElementById('summaryContent');
  if(!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleAdminBox(){
  const el = document.getElementById('adminContent');
  if(!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleDay(day){
  openDays[day] = !openDays[day];
  saveOpenDays();
  if(typeof renderCalendar === 'function') renderCalendar();
}

function setAuthStatus(message, isError = false){
  const el = document.getElementById('authStatus');
  if(!el) return;
  el.textContent = message;
  el.className = 'status ' + (isError ? 'err' : 'ok');
}

function setPlannerStatus(message, isError = false){
  const el = document.getElementById('plannerStatus');
  if(!el) return;
  el.textContent = message;
  el.className = 'status ' + (isError ? 'err' : 'ok');
}

function setAdminStatus(message, isError = false){
  const el = document.getElementById('adminStatus');
  if(!el) return;
  el.textContent = message;
  el.className = 'status ' + (isError ? 'err' : 'ok');
}

function renderAdminBox(){
  const adminBox = document.getElementById('adminBox');
  const adminContent = document.getElementById('adminContent');

  if(adminBox) adminBox.style.display = currentIsAdmin ? 'block' : 'none';

  if(!currentIsAdmin && adminContent){
    adminContent.style.display = 'none';
    setAdminStatus('');
  }

  populateAdminSelectors();
}

function renderCurrentDoctor(){
  const box = document.getElementById('currentDoctorBox');
  if(!box) return;

  if(!currentDoctor){
    box.textContent = 'Current doctor: none';
  } else {
    box.innerHTML = `Current doctor: ${escapeHtml(currentDoctor)} ${currentIsAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}`;
  }

  renderAdminBox();
}

function getShiftRows(day, time){
  return allBookings.filter(
    row => Number(row.day) === Number(day) && row.time === time
  );
}

function getShiftDoctors(day, time){
  return getShiftRows(day, time).map(row => row.doctor);
}

function getShiftLeader(day, time){
  const rows = getShiftRows(day, time);
  const leaderRow = rows.find(row => row.shift_leader);
  return leaderRow ? leaderRow.shift_leader : '';
}

function getShiftOnCall(day, time){
  const rows = getShiftRows(day, time);
  const names = new Set();

  rows.forEach(row => {
    const values = Array.isArray(row.on_call) ? row.on_call : [];
    values.forEach(name => {
      if(name) names.add(name);
    });
  });

  return Array.from(names);
}

function getDoctorShiftCountForDay(doctor, day){
  return allBookings.filter(
    row => row.doctor === doctor && Number(row.day) === Number(day)
  ).length;
}

function getDoctorTotalShiftCount(doctor){
  return allBookings.filter(row => row.doctor === doctor).length;
}

async function loadDoctors(){
  const { data, error } = await supabaseClient
    .from('doctors')
    .select('id,name,email,active,is_admin')
    .eq('active', true)
    .order('name', { ascending: true });

  if(error){
    console.error(error);
    return;
  }

  allDoctors = data || [];
  populateAdminSelectors();
}

function populateAdminSelectors(){
  const doctorHtml = allDoctors.map(d =>
    `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`
  ).join('');

  const dayHtml = getCurrentDaysArray().map(day =>
    `<option value="${day}">${getCurrentMonthName()} ${day}</option>`
  ).join('');

  const timeHtml = TIMES.map(time =>
    `<option value="${time}">${time}</option>`
  ).join('');

  ['adminDoctor', 'leaderDoctor', 'onCallDoctor'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = doctorHtml;
  });

  ['adminDay', 'leaderDay', 'adminClearDay', 'onCallDay'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = dayHtml;
  });

  ['adminTime', 'leaderTime', 'onCallTime'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = timeHtml;
  });
}

async function getApprovedDoctorByEmail(email){
  const { data, error } = await supabaseClient
    .from('doctors')
    .select('id,name,email,active,is_admin')
    .eq('email', email.toLowerCase())
    .eq('active', true)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function getApprovedDoctorByNameOrEmail(value){
  const input = value.trim();

  if(!input) return null;

  if(input.includes('@')){
    const { data, error } = await supabaseClient
      .from('doctors')
      .select('id,name,email,active,is_admin')
      .eq('email', input.toLowerCase())
      .eq('active', true)
      .maybeSingle();

    if(error) throw error;
    return data;
  }

  const { data, error } = await supabaseClient
    .from('doctors')
    .select('id,name,email,active,is_admin')
    .ilike('name', input)
    .eq('active', true)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function signup(){
  const loginValue = document.getElementById('signup_email')?.value.trim();
  const password = document.getElementById('signup_password')?.value.trim();

  if(!loginValue || !password){
    const msg = 'Enter doctor name or email and password.';
    setAuthStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  try{
    const doctorRow = await getApprovedDoctorByNameOrEmail(loginValue);

    if(!doctorRow){
      const msg = 'This doctor is not in the approved doctors list.';
      setAuthStatus(msg, true);
      showToast(msg, 'err');
      return;
    }

    const { error } = await supabaseClient.auth.signUp({
      email: doctorRow.email.toLowerCase(),
      password
    });

    if(error){
      setAuthStatus(error.message, true);
      showToast(error.message, 'err');
      return;
    }

    const msg = `Signup successful for ${doctorRow.name}. Now log in.`;
    setAuthStatus(msg);
    showToast(msg, 'ok');
  }catch(err){
    console.error(err);
    const msg = 'Could not verify approved doctor.';
    setAuthStatus(msg, true);
    showToast(msg, 'err');
  }
}

async function login(){
  const loginValue = document.getElementById('signup_email')?.value.trim();
  const password = document.getElementById('signup_password')?.value.trim();

  if(!loginValue || !password){
    const msg = 'Enter doctor name or email and password.';
    setAuthStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  try{
    const doctorRow = await getApprovedDoctorByNameOrEmail(loginValue);

    if(!doctorRow){
      const msg = 'Doctor not found in approved doctors table.';
      setAuthStatus(msg, true);
      showToast(msg, 'err');
      return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
      email: doctorRow.email.toLowerCase(),
      password
    });

    if(error){
      setAuthStatus(error.message, true);
      showToast(error.message, 'err');
      return;
    }

    await loadCurrentDoctorFromSession();

    const msg = currentIsAdmin
      ? `Logged in as ${doctorRow.name} (Admin)`
      : `Logged in as ${doctorRow.name}`;

    setAuthStatus(msg);
    showToast(msg, 'ok');
  }catch(err){
    console.error(err);
    const msg = 'Could not verify doctor login.';
    setAuthStatus(msg, true);
    showToast(msg, 'err');
  }
}

async function logoutDoctor(){
  await supabaseClient.auth.signOut();
  currentDoctor = null;
  currentEmail = null;
  currentIsAdmin = false;
  renderCurrentDoctor();
  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderSummary === 'function') renderSummary();

  const msg = 'Logged out.';
  setAuthStatus(msg);
  setPlannerStatus('');
  setAdminStatus('');
  showToast(msg, 'info');
}

async function loadCurrentDoctorFromSession(){
  const { data, error } = await supabaseClient.auth.getUser();

  if(error || !data?.user?.email){
    currentDoctor = null;
    currentEmail = null;
    currentIsAdmin = false;
    renderCurrentDoctor();
    return;
  }

  const email = data.user.email.toLowerCase();

  try{
    const doctorRow = await getApprovedDoctorByEmail(email);

    if(!doctorRow){
      currentDoctor = null;
      currentEmail = null;
      currentIsAdmin = false;
      renderCurrentDoctor();
      const msg = 'Logged in user is not approved in doctors table.';
      setAuthStatus(msg, true);
      showToast(msg, 'err');
      return;
    }

    currentDoctor = doctorRow.name;
    currentEmail = doctorRow.email;
    currentIsAdmin = !!doctorRow.is_admin;
    renderCurrentDoctor();
  }catch(err){
    console.error(err);
    currentDoctor = null;
    currentEmail = null;
    currentIsAdmin = false;
    renderCurrentDoctor();
  }
}

async function loadBookings(){
  const { data, error } = await supabaseClient
    .from('shifts')
    .select('id,day,time,doctor,shift_leader,on_call,month_index,year,created_at')
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear)
    .order('day', { ascending: true })
    .order('time', { ascending: true })
    .order('created_at', { ascending: true });

  if(error){
    console.error(error);
    const msg = 'Failed to load bookings.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  allBookings = data || [];

  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderSummary === 'function') renderSummary();
}

async function reserveShift(day, time){
  if(!currentDoctor){
    const msg = 'Please log in first.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const alreadyBookedByMe = allBookings.some(row =>
    Number(row.day) === Number(day) &&
    row.time === time &&
    row.doctor === currentDoctor
  );

  if(alreadyBookedByMe){
    const msg = `You already booked ${getCurrentMonthName()} ${day} ${time}.`;
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const myCountToday = getDoctorShiftCountForDay(currentDoctor, day);

  if(myCountToday >= 3){
    const msg = 'A doctor cannot have more than 3 shifts in the same 24-hour day.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const totalShifts = getDoctorTotalShiftCount(currentDoctor);
  const totalHours = totalShifts * SHIFT_HOURS;

  if(totalShifts >= MAX_MONTHLY_SHIFTS || totalHours >= MAX_MONTHLY_HOURS){
    const msg = `This doctor has already reached ${MAX_MONTHLY_HOURS} hours this month.`;
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .insert([{
      day,
      time,
      doctor: currentDoctor,
      shift_leader: null,
      on_call: [],
      month_index: selectedMonthIndex,
      year: selectedYear
    }]);

  if(error){
    console.error(error);

    const duplicateMsg =
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('unique') ||
      error.code === '23505';

    if(duplicateMsg){
      const msg = `You already booked ${getCurrentMonthName()} ${day} ${time}.`;
      setPlannerStatus(msg, true);
      showToast(msg, 'err');
      await loadBookings();
      return;
    }

    const msg = 'Could not save booking.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `Booked ${getCurrentMonthName()} ${day} ${time} for ${currentDoctor}.`;
  setPlannerStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function removeMyBooking(day, time){
  if(!currentDoctor){
    const msg = 'Please log in first.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('day', day)
    .eq('time', time)
    .eq('doctor', currentDoctor)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not remove booking.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `Removed booking for ${getCurrentMonthName()} ${day} ${time}.`;
  setPlannerStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function clearMyBookings(){
  if(!currentDoctor){
    const msg = 'Please log in first.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const confirmed = confirm(`Delete all bookings for ${currentDoctor} in ${getCurrentMonthLabel()}?`);
  if(!confirmed) return;

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('doctor', currentDoctor)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not clear bookings.';
    setPlannerStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `All bookings removed for ${currentDoctor}.`;
  setPlannerStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function adminAddShift(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const doctorName = document.getElementById('adminDoctor')?.value;
  const day = Number(document.getElementById('adminDay')?.value);
  const time = document.getElementById('adminTime')?.value;

  if(!doctorName || !day || !time){
    const msg = 'Choose doctor, day and time.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const alreadyBooked = allBookings.some(row =>
    Number(row.day) === Number(day) &&
    row.time === time &&
    row.doctor === doctorName
  );

  if(alreadyBooked){
    const msg = `${doctorName} is already booked on ${getCurrentMonthName()} ${day} ${time}.`;
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .insert([{
      day,
      time,
      doctor: doctorName,
      shift_leader: null,
      on_call: [],
      month_index: selectedMonthIndex,
      year: selectedYear
    }]);

  if(error){
    console.error(error);

    const duplicateMsg =
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('unique') ||
      error.code === '23505';

    if(duplicateMsg){
      const msg = `${doctorName} is already booked on ${getCurrentMonthName()} ${day} ${time}.`;
      setAdminStatus(msg, true);
      showToast(msg, 'err');
      await loadBookings();
      return;
    }

    const msg = 'Could not add admin booking.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `Admin added ${doctorName} to ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function setShiftLeader(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const doctorName = document.getElementById('leaderDoctor')?.value;
  const day = Number(document.getElementById('leaderDay')?.value);
  const time = document.getElementById('leaderTime')?.value;

  const shiftRows = getShiftRows(day, time);
  const doctorInShift = shiftRows.some(row => row.doctor === doctorName);

  if(!doctorInShift){
    const msg = `${doctorName} is not booked on ${getCurrentMonthName()} ${day} ${time}.`;
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error: clearError } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: null })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(clearError){
    console.error(clearError);
    const msg = 'Could not clear old leader.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: doctorName })
    .eq('day', day)
    .eq('time', time)
    .eq('doctor', doctorName)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not set shift leader.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `${doctorName} is now shift leader for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function clearShiftLeader(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const day = Number(document.getElementById('leaderDay')?.value);
  const time = document.getElementById('leaderTime')?.value;

  const { error } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: null })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not clear shift leader.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `Shift leader cleared for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function setOnCallDoctor(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const doctorName = document.getElementById('onCallDoctor')?.value;
  const day = Number(document.getElementById('onCallDay')?.value);
  const time = document.getElementById('onCallTime')?.value;

  const shiftRows = getShiftRows(day, time);
  const doctorInShift = shiftRows.some(row => row.doctor === doctorName);

  if(!doctorInShift){
    const msg = `${doctorName} is not booked on ${getCurrentMonthName()} ${day} ${time}.`;
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const existing = getShiftOnCall(day, time);

  if(existing.includes(doctorName)){
    const msg = `${doctorName} is already on call for ${getCurrentMonthName()} ${day} ${time}.`;
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const updated = [...existing, doctorName];

  const { error } = await supabaseClient
    .from('shifts')
    .update({ on_call: updated })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not set on-call doctor.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `${doctorName} added to on-call for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function clearOnCallDoctor(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const day = Number(document.getElementById('onCallDay')?.value);
  const time = document.getElementById('onCallTime')?.value;

  const { error } = await supabaseClient
    .from('shifts')
    .update({ on_call: [] })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not clear on-call doctors.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `All on-call doctors cleared for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function adminSetLeaderDirect(day, time, doctorName){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error: clearError } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: null })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(clearError){
    console.error(clearError);
    const msg = 'Could not clear old leader.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: doctorName })
    .eq('day', day)
    .eq('time', time)
    .eq('doctor', doctorName)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not set shift leader.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `${doctorName} is now shift leader for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function adminSetOnCallDirect(day, time, doctorName){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const existing = getShiftOnCall(day, time);

  if(existing.includes(doctorName)){
    const msg = `${doctorName} is already on call for ${getCurrentMonthName()} ${day} ${time}.`;
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const updated = [...existing, doctorName];

  const { error } = await supabaseClient
    .from('shifts')
    .update({ on_call: updated })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not set on-call doctor.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `${doctorName} added to on-call for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'ok');
  await loadBookings();
}

async function removeSingleOnCallDoctor(day, time, doctorName){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const existing = getShiftOnCall(day, time);
  const updated = existing.filter(name => name !== doctorName);

  const { error } = await supabaseClient
    .from('shifts')
    .update({ on_call: updated })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not remove on-call doctor.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `${doctorName} removed from on-call for ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function removeSpecificBooking(day, time, doctorName){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const confirmed = confirm(`Remove ${doctorName} from ${getCurrentMonthName()} ${day} ${time}?`);
  if(!confirmed) return;

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('day', day)
    .eq('time', time)
    .eq('doctor', doctorName)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not remove selected booking.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `Removed ${doctorName} from ${getCurrentMonthName()} ${day} ${time}.`;
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function clearSelectedDay(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const day = Number(document.getElementById('adminClearDay')?.value);
  const confirmed = confirm(`Delete all bookings for ${getCurrentMonthName()} ${day}?`);
  if(!confirmed) return;

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('day', day)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not clear selected day.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = `All bookings removed for ${getCurrentMonthName()} ${day}.`;
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function clearAllBookings(){
  if(!currentIsAdmin){
    const msg = 'Admin only.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const confirmed = confirm(`Delete ALL bookings for ${getCurrentMonthLabel()}?`);
  if(!confirmed) return;

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    const msg = 'Could not clear all bookings.';
    setAdminStatus(msg, true);
    showToast(msg, 'err');
    return;
  }

  const msg = 'All bookings have been removed.';
  setAdminStatus(msg);
  showToast(msg, 'info');
  await loadBookings();
}

async function exportExcel(){
  if(typeof XLSX === 'undefined'){
    const msg = 'Excel export is available only on summary page.';
    showToast(msg, 'err');
    alert(msg);
    return;
  }

  const { data: doctors, error } = await supabaseClient
    .from('doctors')
    .select('name,email');

  if(error){
    alert(error.message);
    showToast(error.message, 'err');
    return;
  }

  const emailToName = {};
  doctors.forEach(d => {
    emailToName[d.email] = d.name;
  });

  const rosterTable = [];
  rosterTable.push([
    'Day',
    '08-12',
    '12-16',
    '16-20',
    '20-24',
    '00-04',
    '04-08'
  ]);

  const totals = {};
  const days = getCurrentDaysArray();

  for(const day of days){
    const row = [`${getCurrentMonthName()} ${day}`];

    for(const time of TIMES){
      const rows = getShiftRows(day, time);
      const leader = getShiftLeader(day, time);
      const onCall = getShiftOnCall(day, time);

      const names = rows.map(r => {
        const value = emailToName[r.doctor] || r.doctor;
        let label = value;
        if(r.doctor === leader) label += ' (Leader)';
        if(onCall.includes(r.doctor)) label += ' (On Call)';
        return label;
      });

      for(const r of rows){
        const name = emailToName[r.doctor] || r.doctor;
        if(!totals[name]){
          totals[name] = { shifts: 0, hours: 0 };
        }
        totals[name].shifts += 1;
        totals[name].hours += SHIFT_HOURS;
      }

      row.push(names.join('\n'));
    }

    rosterTable.push(row);
  }

  const totalsTable = [];
  totalsTable.push(['Doctor', 'Total Shifts', 'Total Hours']);

  Object.keys(totals)
    .sort((a,b) => a.localeCompare(b))
    .forEach(name => {
      totalsTable.push([
        name,
        totals[name].shifts,
        totals[name].hours
      ]);
    });

  const wsRoster = XLSX.utils.aoa_to_sheet(rosterTable);
  const wsTotals = XLSX.utils.aoa_to_sheet(totalsTable);

  const rosterColWidths = rosterTable[0].map((_, colIndex) => {
    let maxLength = 10;
    rosterTable.forEach(row => {
      const cell = row[colIndex] ? row[colIndex].toString() : '';
      const longestLine = Math.max(...cell.split('\n').map(line => line.length), 0);
      if(longestLine > maxLength) maxLength = longestLine;
    });
    return { wch: maxLength + 3 };
  });

  const totalsColWidths = totalsTable[0].map((_, colIndex) => {
    let maxLength = 10;
    totalsTable.forEach(row => {
      const cell = row[colIndex] ? row[colIndex].toString() : '';
      if(cell.length > maxLength) maxLength = cell.length;
    });
    return { wch: maxLength + 3 };
  });

  wsRoster['!cols'] = rosterColWidths;
  wsTotals['!cols'] = totalsColWidths;

  const rosterRange = XLSX.utils.decode_range(wsRoster['!ref']);
  for(let R = rosterRange.s.r; R <= rosterRange.e.r; ++R){
    for(let C = rosterRange.s.c; C <= rosterRange.e.c; ++C){
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = wsRoster[cellAddress];
      if(cell){
        cell.s = {
          alignment: {
            wrapText: true,
            vertical: 'top'
          }
        };
      }
    }
  }

  const totalsRange = XLSX.utils.decode_range(wsTotals['!ref']);
  for(let R = totalsRange.s.r; R <= totalsRange.e.r; ++R){
    for(let C = totalsRange.s.c; C <= totalsRange.e.c; ++C){
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = wsTotals[cellAddress];
      if(cell){
        cell.s = {
          alignment: {
            wrapText: true,
            vertical: 'top'
          }
        };
      }
    }
  }

  wsRoster['!rows'] = rosterTable.map(row => {
    let maxLines = 1;
    row.forEach(cell => {
      if(cell){
        const lines = cell.toString().split('\n').length;
        if(lines > maxLines) maxLines = lines;
      }
    });
    return { hpt: 18 * maxLines };
  });

  wsTotals['!rows'] = totalsTable.map(() => ({ hpt: 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRoster, 'Duty Roster');
  XLSX.utils.book_append_sheet(wb, wsTotals, 'Doctor Totals');

  XLSX.writeFile(wb, `Hospital_Duty_Roster_${getCurrentMonthName()}_${selectedYear}.xlsx`);
  showToast('Excel exported with fitted cells.', 'ok');
}

function setupRealtime(){
  if(realtimeStarted) return;
  realtimeStarted = true;

  supabaseClient
    .channel('shifts-live')
    .on(
      'postgres_changes',
      { event:'*', schema:'public', table:'shifts' },
      async () => {
        await loadBookings();
      }
    )
    .subscribe();
}

async function initShared(){
  updateTitles();
  renderMonthSelector();

  if(!openDays || Object.keys(openDays).length === 0){
    openDays = { 1: true };
    saveOpenDays();
  }

  renderCurrentDoctor();
  await loadDoctors();
  await loadCurrentDoctorFromSession();
  await loadBookings();
  setupRealtime();
}
