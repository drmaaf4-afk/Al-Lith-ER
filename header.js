 function renderHeader(subtitleText = ''){
  const headerHTML = `
    <div class="header-box">
      <img
        class="header-logo"
        src="https://incyqbermouxcrusmzby.supabase.co/storage/v1/object/public/assets/logo.png"
        alt="Al-Lith Hospital Logo"
      >
      <div class="header-ar">مستشفى الليث</div>
      <div class="header-en">Al-Lith Hospital</div>
      <div class="header-sub" id="headerSub">${subtitleText}</div>
    </div>
  `;

  const container = document.getElementById('sharedHeader');
  if(container){
    container.innerHTML = headerHTML;
  }
}
