function renderHeader(subtitleText = ''){
  const container = document.getElementById('sharedHeader');
  if(!container) return;

  container.innerHTML = `
    <div class="header-box" style="text-align:center;">
      
      <img
        class="header-logo"
        src="https://incyqbermouxcrusmzby.supabase.co/storage/v1/object/public/assets/logo6?v=2"
        alt="Al-Lith Hospital Logo"
        style="
          width:100%;
          max-width:380px;
          height:auto;
          display:block;
          margin:0 auto 20px auto;
        "
      >

      <div class="header-ar" style="
        font-size:32px;
        font-weight:bold;
        color:#ffffff;
        margin-bottom:6px;
        direction:rtl;
      ">
       مستشفى الليث /المنصات الرقمية
      </div>

      <div class="header-en" style="
        font-size:34px;
        font-weight:bold;
        color:#ffffff;
        margin-bottom:10px;
      ">
        Al-Lith Hospital
      </div>

      <div class="header-sub" style="
        color:#dbe4ff;
        font-size:18px;
        font-weight:600;
      ">
        ${subtitleText}
      </div>

    </div>
  `;
}
