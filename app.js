const supabaseClient = supabase.createClient(
'https://incyqbermouxcrusmzby.supabase.co',
'sb_publishable_l003s4eZYDjpXjrqft_2VQ_ECLSe5bs'
)

const TIMES=['08-12','12-16','16-20','20-24','00-04','04-08']

let currentDoctor=null
let currentIsAdmin=false
let allBookings=[]
let allDoctors=[]
let openDays={}

function getCurrentMonthName(){

return MONTH_NAMES[selectedMonthIndex]

}

function toggleAdminBox(){

const el=document.getElementById("adminContent")

el.style.display=el.style.display==="none"?"block":"none"

}

async function reserveShift(day,time){

if(!currentDoctor){

alert("Login first")

return

}

await supabaseClient.from("shifts").insert([{

day,time,doctor:currentDoctor,

month_index:selectedMonthIndex,

year:selectedYear

}])

loadBookings()

showToast("Shift booked")

}

async function removeMyBooking(day,time){

await supabaseClient

.from("shifts")

.delete()

.eq("day",day)

.eq("time",time)

.eq("doctor",currentDoctor)

loadBookings()

showToast("Booking removed")

}

function showToast(msg){

alert(msg)

}

async function loadBookings(){

const {data}=await supabaseClient

.from("shifts")

.select("*")

.eq("month_index",selectedMonthIndex)

.eq("year",selectedYear)

allBookings=data||[]

if(typeof renderCalendar==="function")renderCalendar()

if(typeof renderSummary==="function")renderSummary()

}

async function initShared(){

await loadBookings()

}
