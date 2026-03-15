const supabaseClient = supabase.createClient(
  'https://incyqbermouxcrusmzby.supabase.co',
  'sb_publishable_l003s4eZYDjpXjrqft_2VQ_ECLSe5bs'
);

const TIMES = ['08-12','12-16','16-20','20-24','00-04','04-08'];
const MAX_MONTHLY_HOURS = 208;
const SHIFT_HOURS = 4;
const MAX_MONTHLY_SHIFTS = MAX_MONTHLY_HOURS / SHIFT_HOURS;

const START_YEAR = 2026;
const END_YEAR = Math.max(2030, new Date().getFullYear() + 5);

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const MONTH_OPTIONS = [];
for(let year = START_YEAR; year <= END_YEAR; year++){
  for(let monthIndex = 0; monthIndex < 12; monthIndex++){
    MONTH_OPTIONS.push({
      year,
      monthIndex,
      value: `${year}-${monthIndex}`,
      label: `${MONTH_NAMES[monthIndex]} ${year}`
    });
  }
}

let selectedYear = Number(localStorage.getItem('selectedYear') || 2026);
let selectedMonthIndex = Number(localStorage.getItem('selectedMonthIndex') || 3);

let allBookings = [];
let currentDoctor = null;
let currentEmail = null;
let currentIsAdmin = false;
let allDoctors = [];
let openDays = JSON.parse(localStorage.getItem('openDays') || '{}');
let realtimeStarted = false;

function escapeHtml(text){
  return String(text)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
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
  if(headerSub) headerSub.textContent = `Doctor Duty Planner - ${getCurrentMonthLabel()}`;
  if(mainTitle) mainTitle.textContent = `Hospital Duty Planner - ${getCurrentMonthLabel()}`;
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
}

function toggleDay(day){
  openDays[day] = !openDays[day];
  saveOpenDays();
  if(typeof renderCalendar === 'function') renderCalendar();
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
  const days = getCurrentDaysArray();

  const doctorHtml = allDoctors.map(d =>
    `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`
  ).join('');

  const dayHtml = days.map(day =>
    `<option value="${day}">${getCurrentMonthName()} ${day}, ${selectedYear}</option>`
  ).join('');

  const timeHtml = TIMES.map(time =>
    `<option value="${time}">${time}</option>`
  ).join('');

  ['adminDoctor', 'leaderDoctor'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = doctorHtml;
  });

  ['adminDay', 'leaderDay', 'adminClearDay'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = dayHtml;
  });

  ['adminTime', 'leaderTime'].forEach(id => {
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
    setAuthStatus('Enter doctor name or email and password.', true);
    return;
  }

  try{
    const doctorRow = await getApprovedDoctorByNameOrEmail(loginValue);

    if(!doctorRow){
      setAuthStatus('This doctor is not in the approved doctors list.', true);
      return;
    }

    const { error } = await supabaseClient.auth.signUp({
      email: doctorRow.email.toLowerCase(),
      password
    });

    if(error){
      setAuthStatus(error.message, true);
      return;
    }

    setAuthStatus(`Signup successful for ${doctorRow.name}. Now log in.`);
  }catch(err){
    console.error(err);
    setAuthStatus('Could not verify approved doctor.', true);
  }
}

async function login(){
  const loginValue = document.getElementById('signup_email')?.value.trim();
  const password = document.getElementById('signup_password')?.value.trim();

  if(!loginValue || !password){
    setAuthStatus('Enter doctor name or email and password.', true);
    return;
  }

  try{
    const doctorRow = await getApprovedDoctorByNameOrEmail(loginValue);

    if(!doctorRow){
      setAuthStatus('Doctor not found in approved doctors table.', true);
      return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
      email: doctorRow.email.toLowerCase(),
      password
    });

    if(error){
      setAuthStatus(error.message, true);
      return;
    }

    await loadCurrentDoctorFromSession();
    setAuthStatus(currentIsAdmin ? `Logged in as ${doctorRow.name} (Admin)` : `Logged in as ${doctorRow.name}`);
  }catch(err){
    console.error(err);
    setAuthStatus('Could not verify doctor login.', true);
  }
}

async function logoutDoctor(){
  await supabaseClient.auth.signOut();
  currentDoctor = null;
  currentEmail = null;
  currentIsAdmin = false;
  renderCurrentDoctor();
  setAuthStatus('Logged out.');
  setPlannerStatus('');
  setAdminStatus('');
  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderSummary === 'function') renderSummary();
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
      setAuthStatus('Logged in user is not approved in doctors table.', true);
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
    .select('id,day,time,doctor,shift_leader,month_index,year,created_at')
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear)
    .order('day', { ascending: true })
    .order('time', { ascending: true })
    .order('created_at', { ascending: true });

  if(error){
    console.error(error);
    setPlannerStatus('Failed to load bookings.', true);
    return;
  }

  allBookings = data || [];
  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderSummary === 'function') renderSummary();
}

async function reserveShift(day, time){
  if(!currentDoctor){
    setPlannerStatus('Please log in first.', true);
    return;
  }

  const shiftDoctors = getShiftDoctors(day, time);

  if(shiftDoctors.includes(currentDoctor)){
    setPlannerStatus('You already booked this shift.', true);
    return;
  }

  const myCountToday = getDoctorShiftCountForDay(currentDoctor, day);
  if(myCountToday >= 3){
    setPlannerStatus('A doctor cannot have more than 3 shifts in the same 24-hour day.', true);
    return;
  }

  const totalShifts = getDoctorTotalShiftCount(currentDoctor);
  const totalHours = totalShifts * SHIFT_HOURS;

  if(totalShifts >= MAX_MONTHLY_SHIFTS || totalHours >= MAX_MONTHLY_HOURS){
    setPlannerStatus(`This doctor has already reached ${MAX_MONTHLY_HOURS} hours this month.`, true);
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .insert([{
      day,
      time,
      doctor: currentDoctor,
      shift_leader: null,
      month_index: selectedMonthIndex,
      year: selectedYear
    }]);

  if(error){
    console.error(error);
    setPlannerStatus('Could not save booking.', true);
    return;
  }

  setPlannerStatus(`Booked ${getCurrentMonthName()} ${day} ${time} for ${currentDoctor}.`);
  await loadBookings();
}

async function removeMyBooking(day, time){
  if(!currentDoctor){
    setPlannerStatus('Please log in first.', true);
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
    setPlannerStatus('Could not remove booking.', true);
    return;
  }

  setPlannerStatus(`Removed booking for ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function clearMyBookings(){
  if(!currentDoctor){
    setPlannerStatus('Please log in first.', true);
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
    setPlannerStatus('Could not clear bookings.', true);
    return;
  }

  setPlannerStatus(`All bookings removed for ${currentDoctor} in ${getCurrentMonthLabel()}.`);
  await loadBookings();
}

async function adminAddShift(){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
    return;
  }

  const doctorName = document.getElementById('adminDoctor').value;
  const day = Number(document.getElementById('adminDay').value);
  const time = document.getElementById('adminTime').value;

  const alreadyBooked = allBookings.some(
    row => Number(row.day) === day && row.time === time && row.doctor === doctorName
  );

  if(alreadyBooked){
    setAdminStatus(`${doctorName} is already booked on ${getCurrentMonthName()} ${day} ${time}.`, true);
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .insert([{
      day,
      time,
      doctor: doctorName,
      shift_leader: null,
      month_index: selectedMonthIndex,
      year: selectedYear
    }]);

  if(error){
    console.error(error);
    setAdminStatus('Could not add admin booking.', true);
    return;
  }

  setAdminStatus(`Admin added ${doctorName} to ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function setShiftLeader(){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
    return;
  }

  const doctorName = document.getElementById('leaderDoctor').value;
  const day = Number(document.getElementById('leaderDay').value);
  const time = document.getElementById('leaderTime').value;

  const shiftRows = getShiftRows(day, time);
  const doctorInShift = shiftRows.some(row => row.doctor === doctorName);

  if(!doctorInShift){
    setAdminStatus(`${doctorName} is not booked on ${getCurrentMonthName()} ${day} ${time}.`, true);
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
    setAdminStatus('Could not clear old leader.', true);
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
    setAdminStatus('Could not set shift leader.', true);
    return;
  }

  setAdminStatus(`${doctorName} is now shift leader for ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function clearShiftLeader(){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
    return;
  }

  const day = Number(document.getElementById('leaderDay').value);
  const time = document.getElementById('leaderTime').value;

  const { error } = await supabaseClient
    .from('shifts')
    .update({ shift_leader: null })
    .eq('day', day)
    .eq('time', time)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    setAdminStatus('Could not clear shift leader.', true);
    return;
  }

  setAdminStatus(`Shift leader cleared for ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function adminSetLeaderDirect(day, time, doctorName){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
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
    setAdminStatus('Could not clear old leader.', true);
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
    setAdminStatus('Could not set shift leader.', true);
    return;
  }

  setAdminStatus(`${doctorName} is now shift leader for ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function removeSpecificBooking(day, time, doctorName){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
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
    setAdminStatus('Could not remove selected booking.', true);
    return;
  }

  setAdminStatus(`Removed ${doctorName} from ${getCurrentMonthName()} ${day} ${time}.`);
  await loadBookings();
}

async function clearSelectedDay(){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
    return;
  }

  const day = Number(document.getElementById('adminClearDay').value);
  const confirmed = confirm(`Delete all bookings for ${getCurrentMonthName()} ${day}, ${selectedYear}?`);
  if(!confirmed) return;

  const { error } = await supabaseClient
    .from('shifts')
    .delete()
    .eq('day', day)
    .eq('month_index', selectedMonthIndex)
    .eq('year', selectedYear);

  if(error){
    console.error(error);
    setAdminStatus('Could not clear selected day.', true);
    return;
  }

  setAdminStatus(`All bookings removed for ${getCurrentMonthName()} ${day}, ${selectedYear}.`);
  await loadBookings();
}

async function clearAllBookings(){
  if(!currentIsAdmin){
    setAdminStatus('Admin only.', true);
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
    setAdminStatus('Could not clear all bookings.', true);
    return;
  }

  setAdminStatus(`All bookings have been removed for ${getCurrentMonthLabel()}.`);
  await loadBookings();
}

async function exportExcel(){
  const { data: doctors, error } = await supabaseClient
    .from('doctors')
    .select('name,email');

  if(error){
    alert(error.message);
    return;
  }

  const days = getCurrentDaysArray();
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

  for(const day of days){
    const row = [`${getCurrentMonthName()} ${day}, ${selectedYear}`];

    for(const time of TIMES){
      const rows = getShiftRows(day, time);
      const leader = getShiftLeader(day, time);

      const names = rows.map(r => {
        const value = emailToName[r.doctor] ? emailToName[r.doctor] : r.doctor;
        return r.doctor === leader ? `${value} (Leader)` : value;
      });

      for(const r of rows){
        const name = emailToName[r.doctor] ? emailToName[r.doctor] : r.doctor;
        if(!totals[name]){
          totals[name] = { shifts: 0, hours: 0 };
        }
        totals[name].shifts += 1;
        totals[name].hours += SHIFT_HOURS;
      }

      row.push(names.join(', '));
    }

    rosterTable.push(row);
  }

  const totalsTable = [];
  totalsTable.push(['Doctor', 'Total Shifts', 'Total Hours']);

  Object.keys(totals)
    .sort((a, b) => a.localeCompare(b))
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
    let max = 10;
    rosterTable.forEach(row => {
      const val = row[colIndex] ? row[colIndex].toString().length : 0;
      if(val > max) max = val;
    });
    return { wch: max + 2 };
  });

  wsRoster['!cols'] = rosterColWidths;
  wsTotals['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRoster, `Duty Roster ${getCurrentMonthName()} ${selectedYear}`);
  XLSX.utils.book_append_sheet(wb, wsTotals, 'Doctor Totals');

  XLSX.writeFile(wb, `Hospital_Duty_Roster_${getCurrentMonthName()}_${selectedYear}.xlsx`);
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
  if(!openDays || Object.keys(openDays).length === 0){
    openDays = { 1: true };
    saveOpenDays();
  }

  updateTitles();
  renderMonthSelector();
  renderCurrentDoctor();
  await loadDoctors();
  await loadCurrentDoctorFromSession();
  await loadBookings();
  setupRealtime();
}
