// ─── NAV ───
  const pages = ['home','predictor','statistics','guidelines'];

  // ─── LIVE USER COUNT ───
  fetch('/api/user-count')
    .then(r => r.json())
    .then(data => {
      const el = document.getElementById('user-count-stat');
      if (el) el.textContent = data.count.toLocaleString();
    })
    .catch(() => {
      const el = document.getElementById('user-count-stat');
      if (el) el.textContent = '0';
    });

  function showPage(id) {
    pages.forEach(p => {
      document.getElementById('page-'+p).classList.remove('active');
      const el = document.getElementById('nav-'+p);
      if(el) el.classList.remove('active');
    });
    document.getElementById('page-'+id).classList.add('active');
    const navEl = document.getElementById('nav-'+id);
    if(navEl) navEl.classList.add('active');
    window.scrollTo(0,0);
    if(id === 'statistics') animateBars();
  }

  function toggleMenu() {
    document.getElementById('mobile-menu').classList.toggle('open');
  }

  // ─── TYPING EFFECT ───
  (function initTyping() {
    const el = document.getElementById('typing-text');
    if (!el) return;
    const text = 'Answer a few questions about your symptoms and health profile to receive a personalized risk assessment and guidance.';
    let i = 0;
    function type() {
      if (i <= text.length) { el.textContent = text.slice(0, i++); setTimeout(type, 28); }
    }
    setTimeout(type, 600);
  })();

  // ─── PARTICLES ───
  (function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles;
    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }
    function mkParticle() {
      return { x: Math.random()*W, y: Math.random()*H, r: Math.random()*3+1,
        vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
        a: Math.random()*.5+.1 };
    }
    function init() { resize(); particles = Array.from({length:55}, mkParticle); }
    function draw() {
      ctx.clearRect(0,0,W,H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0||p.x>W) p.vx*=-1;
        if(p.y<0||p.y>H) p.vy*=-1;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = `rgba(2,132,199,${p.a})`;
        ctx.fill();
      });
      for(let i=0;i<particles.length;i++) {
        for(let j=i+1;j<particles.length;j++) {
          const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          if(dist<90) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x,particles[i].y);
            ctx.lineTo(particles[j].x,particles[j].y);
            ctx.strokeStyle=`rgba(2,132,199,${.15*(1-dist/90)})`;
            ctx.lineWidth=.8;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    init(); draw();
    window.addEventListener('resize', init);
  })();

  // ─── ANIMATED COUNTERS ───
  (function initCounters() {
    const els = document.querySelectorAll('[data-count]');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = +el.dataset.count;
        const suffix = el.dataset.suffix || '';
        const divisor = +(el.dataset.divisor || 1);
        const dur = 1800;
        let start = null;
        function tick(ts) {
          if (!start) start = ts;
          const prog = Math.min((ts-start)/dur, 1);
          const val = divisor > 1 ? Math.round(prog * target / divisor) : Math.round(prog * target);
          el.textContent = val + suffix;
          if (prog < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    }, {threshold:.3});
    els.forEach(el => obs.observe(el));
  })();

  // ─── SCROLL REVEAL ───
  (function initReveal() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 120);
          obs.unobserve(e.target);
        }
      });
    }, {threshold:.15});
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  })();

  // ─── ANIMATE BARS ───
  function animateBars() {
    document.querySelectorAll('.bar-chart, .h-bar-chart').forEach(chart => {
      chart.classList.add('bars-animated');
    });
  }

  // ─── PREDICTOR ───
  const symptoms = {
    fever: {label:'Fever', weight:3},
    cough: {label:'Dry Cough', weight:2},
    fatigue: {label:'Severe Fatigue', weight:2},
    smell: {label:'Loss of Smell/Taste', weight:4},
    breathing: {label:'Shortness of Breath', weight:4},
    chest: {label:'Chest Pain', weight:5},
    headache: {label:'Headache', weight:1},
    sore_throat: {label:'Sore Throat', weight:1},
    body_ache: {label:'Body Aches', weight:2},
    diarrhea: {label:'Diarrhea/Nausea', weight:1},
  };
  const riskFactors = {
    age_60: {label:'Age 60+', weight:3},
    diabetes: {label:'Diabetes', weight:2},
    asthma: {label:'Asthma', weight:2},
    heart_disease: {label:'Heart disease', weight:3},
    lung_disease: {label:'Lung disease', weight:3},
    immunocompromised: {label:'Immunocompromised', weight:4},
    obesity: {label:'Obesity', weight:2},
    unvaccinated: {label:'Not vaccinated', weight:2},
    pregnant: {label:'Pregnant', weight:2},
    contact_with_infected_person: {label:'Close contact', weight:3},
    travel_history: {label:'Recent travel', weight:2},
  };

  const selectedSymptoms = new Set();
  const selectedRisks = new Set();

  function toggleItem(btn, type) {
    const id = btn.getAttribute('data-id');
    const set = type === 'symptoms' ? selectedSymptoms : selectedRisks;
    if (set.has(id)) { set.delete(id); btn.classList.remove('selected'); }
    else { set.add(id); btn.classList.add('selected'); }
    if (type === 'symptoms') {
      document.getElementById('symptom-count').textContent = selectedSymptoms.size + ' selected';
    }
  }

  function setStepActive(n) {
    for(let i=1;i<=3;i++){
      const circle = document.getElementById('step'+i);
      const label = document.getElementById('step'+i+'-label');
      if(i < n){ circle.className='step-circle done'; circle.textContent='✓'; label.className='step-label'; }
      else if(i===n){ circle.className='step-circle active'; circle.textContent=i; label.className='step-label active'; }
      else { circle.className='step-circle'; circle.textContent=i; label.className='step-label'; }
    }
    for(let i=1;i<=2;i++){
      document.getElementById('conn'+i).className='step-connector'+(i<n?' done':'');
    }
  }

  function goToStep2() {
    document.getElementById('s1').style.display='none';
    document.getElementById('s2').style.display='block';
    setStepActive(2);
    window.scrollTo(0,0);
  }

  function goToStep1() {
    document.getElementById('s2').style.display='none';
    document.getElementById('s1').style.display='block';
    setStepActive(1);
    window.scrollTo(0,0);
  }

  async function showResult() {
    const age = parseInt(document.getElementById("age").value, 10);
    const gender = document.getElementById("gender").value;
    const name = document.getElementById("name").value.trim();
    const oxygenRaw = document.getElementById("oxygen_level").value;
    const tempRaw = document.getElementById("body_temperature").value;
    const oxygenLevel = oxygenRaw !== '' ? parseFloat(oxygenRaw) : 98;
    const bodyTemperature = tempRaw !== '' ? parseFloat(tempRaw) : 37;
    const otherSymptoms = document.getElementById("other_symptoms").value.trim();

    if(!age || age <= 0){ alert("Please enter valid age"); return; }
    if(!gender){ alert("Please select gender"); return; }
    if(oxygenRaw !== '' && (oxygenLevel < 50 || oxygenLevel > 100)){ alert("Please enter oxygen level between 50 and 100"); return; }
    if(tempRaw !== '' && (bodyTemperature < 34 || bodyTemperature > 45)){ alert("Please enter body temperature between 34\u00b0C and 45\u00b0C"); return; }

    // Parse other symptoms for known keywords
    const otherLower = otherSymptoms.toLowerCase();
    const otherKeywords = [
      { words: ['nausea','vomit'], score: 5 },
      { words: ['diarrhea','loose'], score: 5 },
      { words: ['body ache','muscle','joint'], score: 6 },
      { words: ['rash','skin'], score: 4 },
      { words: ['dizzy','dizziness'], score: 6 },
      { words: ['sweat','chills'], score: 7 },
      { words: ['runny nose','congestion'], score: 4 },
      { words: ['eye','conjunctiv'], score: 3 },
      { words: ['weak','weakness'], score: 6 },
      { words: ['pain'], score: 4 },
    ];
    let otherScore = 0;
    otherKeywords.forEach(k => { if(k.words.some(w => otherLower.includes(w))) otherScore += k.score; });
    if(otherSymptoms && otherScore === 0) otherScore = 5; // any unknown symptom adds small score

    // Show loading spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner-overlay';
    spinner.innerHTML = '<div class="spinner"></div><div class="spinner-text">Analyzing your symptoms...</div>';
    document.body.appendChild(spinner);

    let prediction;
    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age, gender, symptoms: [...selectedSymptoms], riskFactors: [...selectedRisks], oxygenLevel, bodyTemperature, otherSymptoms })
      });
      prediction = await response.json();
      if(!response.ok) throw new Error(prediction.error || 'Prediction failed');
    } catch (error) {
      // Fallback: calculate risk locally if backend is unavailable
      const symCount = selectedSymptoms.size;
      const riskCount = selectedRisks.size;
      const vitalsNormal = oxygenLevel >= 95 && bodyTemperature < 38;
      if (symCount === 0 && riskCount === 0 && vitalsNormal) {
        prediction = { riskPercent: 0, riskLevel: 'Low', resultText: 'COVID risk not detected' };
      } else {
        let score = symCount * 10 + riskCount * 8 + otherScore;
        if (selectedSymptoms.has('chest') || selectedSymptoms.has('breathing')) score += 15;
        if (oxygenLevel < 95) score += 15;
        if (oxygenLevel < 90) score += 20;
        if (bodyTemperature >= 38) score += 10;
        if (age >= 60) score += 10;
        score = Math.min(100, score);
        let riskLevel = score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Moderate' : 'Low';
        prediction = { riskPercent: score, riskLevel, resultText: score >= 50 ? 'COVID risk detected' : 'COVID risk not detected' };
      }
    }
    spinner.remove();

    const pct = prediction.riskPercent;
    const level = prediction.riskLevel;
    let color, bg, border, icon, rec, actions, emergency=false, doctor=false;

    if (level === 'Critical') {
      color='#dc2626'; bg='#fef2f2'; border='#fca5a5'; icon='🚨'; emergency=true;
      rec='Seek immediate medical attention. These symptoms may indicate severe COVID-19 complications.';
      actions=['Call emergency services (911) or go to the nearest emergency room immediately','Do not drive yourself — call for assistance','Inform medical staff about all your symptoms on arrival','Isolate from others while awaiting emergency services'];
    } else if (level === 'High') {
      color='#ea580c'; bg='#fff7ed'; border='#fdba74'; icon='⚠️'; doctor=true;
      rec='Your backend prediction shows high COVID-19 risk. Medical consultation and COVID-19 testing are strongly advised.';
      actions=['Contact your doctor or healthcare provider immediately','Get a COVID-19 PCR test as soon as possible','Self-isolate until test results are confirmed','Monitor symptoms closely and call emergency services if they worsen','Inform close contacts about potential exposure'];
    } else if (level === 'Moderate') {
      color='#ca8a04'; bg='#fefce8'; border='#fde047'; icon='⚡'; doctor=true;
      rec='Your backend prediction shows moderate risk. Testing and medical consultation are recommended.';
      actions=['Get a COVID-19 rapid antigen or PCR test','Consult your doctor, especially if symptoms worsen','Self-isolate at home until test results are available','Wear a mask in public and around household members','Monitor your temperature and oxygen levels daily','Stay hydrated and rest'];
    } else {
      color='#16a34a'; bg='#f0fdf4'; border='#86efac'; icon='✅';
      rec='Your backend prediction shows low risk. Continue following general health precautions.';
      actions=['Maintain regular handwashing and good hygiene','Wear a mask in crowded indoor settings if unvaccinated','Stay home if you feel unwell','Monitor for any developing symptoms','Stay up to date with COVID-19 vaccinations'];
    }

    // Apply styles
    const rm = document.getElementById('result-main');
    rm.style.background=bg; rm.style.borderColor=border;
    const ri = document.getElementById('result-icon');
    ri.textContent=icon; ri.style.background=color; ri.style.fontSize='40px';
    const rl = document.getElementById('result-level-text');
    rl.textContent=level+' Risk'; rl.style.color=color;
    const rpf = document.getElementById('result-prog');
    rpf.style.background=color;
    const rpct = document.getElementById('result-pct');
    rpct.textContent='Risk Score: '+pct+'%'; rpct.style.color=color;
    document.getElementById('result-sub-text').textContent = rec + ' (' + prediction.resultText + ')';

    // Stats row
    document.getElementById('result-stat-pct').textContent = pct + '%';
    document.getElementById('emergency-banner').style.display=emergency?'flex':'none';
    document.getElementById('doctor-banner').style.display=(doctor&&!emergency)?'flex':'none';

    // Actions
    const al = document.getElementById('actions-list');
    al.innerHTML = actions.map((a,i)=>`<div class="action-item"><div class="action-num">${i+1}</div><div class="action-text">${a}</div></div>`).join('');

    // Summary
    document.getElementById('sum-symptoms').textContent=selectedSymptoms.size;
    document.getElementById('sum-risks').textContent=selectedRisks.size;

    const st = document.getElementById('symptom-tags');
    let stHTML = '';
    if(selectedSymptoms.size>0){
      stHTML += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Symptoms Reported</div><div class="tag-wrap">'
        +[...selectedSymptoms].map(id=>symptoms[id]?`<span class="tag tag-blue">${symptoms[id].label}</span>`:'').join('')+'</div>';
    }
    if(otherSymptoms){
      stHTML += `<div style="font-size:11px;color:var(--muted);margin:10px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Other Symptoms</div><div style="font-size:13px;color:var(--fg);background:var(--bg);border-radius:10px;padding:10px 14px;">${otherSymptoms}</div>`;
    }
    st.innerHTML = stHTML;

    const rt = document.getElementById('risk-tags');
    if(selectedRisks.size>0){
      rt.innerHTML='<div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:12px">Risk Factors Reported</div><div class="tag-wrap">'
        +[...selectedRisks].map(id=>riskFactors[id]?`<span class="tag tag-orange">${riskFactors[id].label}</span>`:'').join('')+'</div>';
    } else { rt.innerHTML=''; }

    document.getElementById('s2').style.display='none';
    document.getElementById('s3').style.display='block';
    setStepActive(3);
    window.scrollTo(0,0);

    // Animate progress bar
    setTimeout(()=>{ rpf.style.width=pct+'%'; }, 100);
  }

  function resetPredictor() {
    selectedSymptoms.clear();
    selectedRisks.clear();
    document.querySelectorAll('.symptom-btn.selected').forEach(b=>b.classList.remove('selected'));
    document.getElementById('symptom-count').textContent='0 selected';
    document.getElementById('other_symptoms').value='';
    document.getElementById('s3').style.display='none';
    document.getElementById('s1').style.display='block';
    setStepActive(1);
    window.scrollTo(0,0);
  }

  // ─── GUIDELINES ───
  function toggleGuide(btn) {
    const chevron = btn.querySelector('.guide-chevron');
    const body = btn.parentElement.querySelector('.guide-card-body');
    if(body.style.display==='none'||body.style.display===''){
      body.style.display='block'; chevron.classList.add('open');
    } else {
      body.style.display='none'; chevron.classList.remove('open');
    }
  }

  function toggleFaq(btn) {
    const icon = btn.querySelector('.faq-icon');
    const ans = btn.parentElement.querySelector('.faq-a');
    ans.classList.toggle('open');
    icon.classList.toggle('open');
  }
