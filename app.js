const supabaseClient = supabase.createClient(
  'https://incyqbermouxcrusmzby.supabase.co',
  'sb_publishable_l003s4eZYDjpXjrqft_2VQ_ECLSe5bs'
);

const TIMES = ['08-12', '12-16', '16-20', '20-24', '00-04', '04-08'];
const MAX_MONTHLY_HOURS = 208;
const SHIFT_HOURS = 4;
const MAX_MONTHLY_SHIFTS = MAX_MONTHLY_HOURS / SHIFT_HOURS;

let allBookings = [];
let currentDoctor = null;
let currentEmail = null;
let currentIsAdmin = false;
let allDoctors = [];

/* =========================
   HELPERS
========================= */

function normalizeEmail(email){
  return String(email || '').trim().toLowerCase();
}

function showToast(msg){
  console.log(msg);
}

/* =========================
   UI UPDATE
========================= */

function refreshUI(){
  renderCurrentDoctor();
  if(typeof renderCalendar === 'function') renderCalendar();
  if(typeof renderSummary === 'function') renderSummary();
}

function renderCurrentDoctor(){
  const el = document.getElementById('currentDoctorBox');
  if(!el) return;

  if(!currentDoctor){
    el.textContent = 'Current doctor: none';
  }else{
    el.textContent = `Current doctor: ${currentDoctor}`;
  }
}

/* =========================
   DOCTORS
========================= */

async function getApprovedDoctorByEmail(email){
  const { data } = await supabaseClient
    .from('doctors')
    .select('name,email,is_admin')
    .eq('email', normalizeEmail(email))
    .eq('active', true)
    .maybeSingle();

  return data;
}

/* =========================
   AUTH
========================= */

async function login(){
  const loginValue = document.getElementById('signup_email').value.trim();
  const password = document.getElementById('signup_password').value.trim();

  if(!loginValue || !password){
    alert('Enter email and password');
    return;
  }

  const doctor = await getApprovedDoctorByEmail(loginValue);

  if(!doctor){
    alert('Doctor not found');
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: normalizeEmail(doctor.email),
    password
  });

  if(error){
    alert(error.message);
    return;
  }

  await loadCurrentDoctorFromSession();
  refreshUI();
}

async function logoutDoctor(){
  await supabaseClient.auth.signOut();

  currentDoctor = null;
  currentEmail = null;
  currentIsAdmin = false;

  refreshUI();
}

async function loadCurrentDoctorFromSession(){
  const { data } = await supabaseClient.auth.getUser();

  if(!data?.user?.email){
    currentDoctor = null;
    currentEmail = null;
    currentIsAdmin = false;
    return;
  }

  const doctor = await getApprovedDoctorByEmail(data.user.email);

  if(!doctor){
    currentDoctor = null;
    currentEmail = null;
    currentIsAdmin = false;
    return;
  }

  currentDoctor = doctor.name;
  currentEmail = doctor.email;
  currentIsAdmin = !!doctor.is_admin;
}

/* =========================
   BOOKINGS
========================= */

function getShiftRows(day, time){
  return allBookings.filter(
    r => Number(r.day) === Number(day) && r.time === time
  );
}

function getDoctorShiftCountForDay(doctor, day){
  return allBookings.filter(
    r => r.doctor === doctor && Number(r.day) === Number(day)
  ).length;
}

function getDoctorTotalShiftCount(doctor){
  return allBookings.filter(r => r.doctor === doctor).length;
}

/* =========================
   LOAD BOOKINGS
========================= */

async function loadBookings(){
  const { data } = await supabaseClient
    .from('shifts')
    .select('*');

  allBookings = data || [];
  refreshUI();
}

/* =========================
   RESERVE SHIFT
========================= */

async function reserveShift(day, time){

  if(!currentDoctor){
    alert('Login first');
    return;
  }

  // prevent duplicate
  const already = allBookings.some(r =>
    Number(r.day) === Number(day) &&
    r.time === time &&
    r.doctor === currentDoctor
  );

  if(already){
    alert('Already booked');
    return;
  }

  // ✅ KEEP THIS RULE
  const myCountToday = getDoctorShiftCountForDay(currentDoctor, day);

  if(myCountToday >= 3){
    alert('Max 3 shifts per day');
    return;
  }

  // monthly limit
  const total = getDoctorTotalShiftCount(currentDoctor);

  if(total >= MAX_MONTHLY_SHIFTS){
    alert('Monthly limit reached');
    return;
  }

  const { error } = await supabaseClient
    .from('shifts')
    .insert([{
      day,
      time,
      doctor: currentDoctor
    }]);

  if(error){
    alert(error.message);
    return;
  }

  await loadBookings();
}

/* =========================
   REMOVE BOOKING
========================= */

async function removeMyBooking(day, time){

  if(!currentDoctor){
    alert('Login first');
    return;
  }

  await supabaseClient
    .from('shifts')
    .delete()
    .eq('day', day)
    .eq('time', time)
    .eq('doctor', currentDoctor);

  await loadBookings();
}

/* =========================
   INIT
========================= */

async function init(){

  await loadCurrentDoctorFromSession();
  await loadBookings();

  // 🔥 IMPORTANT: listen to auth changes
  supabaseClient.auth.onAuthStateChange(async () => {
    await loadCurrentDoctorFromSession();
    refreshUI();
  });

  refreshUI();
}

init();
