function renderHeader(subtitleText = ''){
  const container = document.getElementById('sharedHeader');
  if(!container) return;

  container.innerHTML = `
    <div class="header-box">
      <img
        class="header-logo"
        src="https://incyqbermouxcrusmzby.supabase.co/storage/v1/object/public/assets/logo5?v=1"
        alt="Al-Lith Hospital Logo"
      >
      <div class="header-ar">مستشفى الليث</div>
      <div class="header-en">Al-Lith Hospital</div>
      <div class="header-sub">${subtitleText}</div>
    </div>
  `;
}
