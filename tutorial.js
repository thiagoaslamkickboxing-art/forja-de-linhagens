// Forja de Linhagens — Batalha Tutorial Roteirizada (13 passos determinísticos)
(function () {
  "use strict";

  const DECK = ["druida", "domadora", "ent", "cleriga", "novica", "paladino"];
  // Fila determinística de invocações do tutorial
  const SUMMON_SEQ = ["domadora", "cleriga", "druida", "novica", "ent", "paladino"];

  let api = null;
  let active = false;
  let stepIdx = 0; // 0..12 (13 passos)
  let summonCount = 0;
  let waitTimer = 0;

  const STEPS = [
    {
      id: 1, title: "1/13 · As Colunas",
      text: "A horda desce pelas colunas. Se chegar à muralha, você perde vidas.",
      action: "ack", target: "lanes"
    },
    {
      id: 2, title: "2/13 · Invocar Heróis",
      text: "Toque em Invocar. Cada herói custa ouro.",
      action: "summon", target: "#bSummon"
    },
    {
      id: 3, title: "3/13 · Preparação",
      text: "Entre as ondas você pode reorganizar o exército. Arraste este herói para a frente.",
      action: "move", target: "moveFront"
    },
    {
      id: 4, title: "4/13 · Iniciar Onda",
      text: "Pronto? Toque em Iniciar onda. Começar antes rende ouro.",
      action: "wave", target: "#prepStart"
    },
    {
      id: 5, title: "5/13 · Fusão Nível 2",
      text: "Arraste um herói sobre outro do MESMO nível para fundir. Escolas diferentes criam linhagens novas!",
      action: "fuse2", target: "fusePair2"
    },
    {
      id: 6, title: "6/13 · Raridade",
      text: "A raridade da fusão é sorteada. Iguais nunca caem de raridade.",
      action: "ack", target: "fusedUnit"
    },
    {
      id: 7, title: "7/13 · Linhagens",
      text: "Heróis da mesma linhagem ficam mais fortes juntos.",
      action: "ack", target: "#linBar"
    },
    {
      id: 8, title: "8/13 · Reações Elementais",
      text: "Status combinados geram reações, como Vapor.",
      action: "ack", target: "lanes"
    },
    {
      id: 9, title: "9/13 · Habilidades",
      text: "Suportes fortalecem vizinhos com Auras, e Armadilheiros plantam emboscadas no caminho.",
      action: "ack", target: "board"
    },
    {
      id: 10, title: "10/13 · Meteoro",
      text: "Abates enchem o meteoro. Toque em Meteoro e escolha onde cair.",
      action: "meteor", target: "#bSpell"
    },
    {
      id: 11, title: "11/13 · Fusões 3 e 4",
      text: "Funda dois Nível 2 para criar um Nível 3, e dois Nível 3 para um Nível 4 — a força cresce a cada geração!",
      action: "fuse4", target: "fuseHigh"
    },
    {
      id: 12, title: "12/13 · Fusão Divina",
      text: "Arraste os dois Nível 4 Lendários um sobre o outro para despertar um DEUS!",
      action: "fuse5", target: "fuseGod"
    },
    {
      id: 13, title: "13/13 · O Despertar",
      text: "Dois níveis 4 Lendários despertam um DEUS. Existem outros... descubra-os.",
      action: "final", target: "board"
    }
  ];

  function $(id) { return document.getElementById(id); }

  function makeStage() {
    return {
      mode: "tutorial",
      r: 0, s: 1, hard: false, endless: false,
      key: "c_tutorial",
      n: "Tutorial · Clareira",
      rn: "Clareira dos Vaga-lumes",
      th: "forest",
      type: "normal",
      waves: 3,
      factor: 0.32,
      hpFactor: 0.32,
      affix: null, chal: null, star3: null,
      deck: [...DECK],
      fixedLv: 2,
      startGold: 120,
      allowFuse: 5,
      seed: 1337
    };
  }

  function positionHighlight(target) {
    const spot = $("tutSpot"), hand = $("tutHand"), bubble = $("tutBubble");
    if (!spot || !hand || !bubble) return;
    let rect = null;
    if (typeof target === "string" && target.startsWith("#")) {
      const el = document.querySelector(target);
      if (el && el.offsetWidth > 0) rect = el.getBoundingClientRect();
    } else if (api && api.getRect) {
      rect = api.getRect(target);
    }
    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 6;
      spot.hidden = false;
      spot.style.left = Math.max(4, rect.left - pad) + "px";
      spot.style.top = Math.max(4, rect.top - pad) + "px";
      spot.style.width = (rect.width + pad * 2) + "px";
      spot.style.height = (rect.height + pad * 2) + "px";
      hand.hidden = false;
      hand.style.left = Math.min(window.innerWidth - 36, rect.left + rect.width * 0.5) + "px";
      hand.style.top = Math.min(window.innerHeight - 40, rect.top + rect.height + 6) + "px";
      // Posiciona balão longe do alvo (em cima se alvo embaixo, embaixo se alvo em cima)
      const inBottom = rect.top > window.innerHeight * 0.52;
      bubble.style.top = inBottom ? "max(64px, 12vh)" : "auto";
      bubble.style.bottom = inBottom ? "auto" : "max(106px, 16vh)";
    } else {
      spot.hidden = true;
      hand.hidden = true;
      bubble.style.top = "max(68px, 13vh)";
      bubble.style.bottom = "auto";
    }
  }

  function renderStep() {
    if (!active) return;
    const ov = $("tutWrap");
    if (!ov) return;
    const st = STEPS[stepIdx];
    if (!st) { finishTutorial(false); return; }
    ov.classList.add("on");
    $("tutTitle").textContent = st.title;
    $("tutTxt").textContent = st.text;
    const nextBtn = $("tutNext");
    const isAck = st.action === "ack";
    nextBtn.hidden = !isAck;
    nextBtn.textContent = "Entendi ▸";
    // Escurece o fundo apenas nos passos explicativos; nos passos de ação deixa livre para arrastar/tocar
    ov.classList.toggle("dim", isAck);
    positionHighlight(st.target);
  }

  function setupStep(idx) {
    stepIdx = idx;
    if (!active || !api) return;
    const st = STEPS[stepIdx];
    if (!st) { finishTutorial(false); return; }
    api.prepareStep(st.id);
    renderStep();
  }

  function advance() {
    if (!active) return;
    clearTimeout(waitTimer);
    if (stepIdx + 1 >= STEPS.length) {
      finishTutorial(false);
    } else {
      setupStep(stepIdx + 1);
    }
  }

  function finishTutorial(skipped) {
    if (!active) return;
    active = false;
    clearTimeout(waitTimer);
    const ov = $("tutWrap");
    if (ov) ov.classList.remove("on", "dim");
    if (api) api.onComplete(skipped);
  }

  window.TUT = {
    DECK,
    makeStage,
    isActive: () => active,
    currentStep: () => (active && STEPS[stepIdx] ? STEPS[stepIdx].id : 0),
    nextSummonId() {
      const id = SUMMON_SEQ[summonCount % SUMMON_SEQ.length];
      summonCount++;
      return id;
    },
    start(bridge) {
      api = bridge;
      active = true;
      stepIdx = 0;
      summonCount = 0;
      clearTimeout(waitTimer);
      setupStep(0);
    },
    stop() {
      active = false;
      clearTimeout(waitTimer);
      const ov = $("tutWrap");
      if (ov) ov.classList.remove("on", "dim");
    },
    skip() {
      finishTutorial(true);
    },
    onAck() {
      if (!active) return;
      const st = STEPS[stepIdx];
      if (st && st.action === "ack") advance();
    },
    onAction(ev, payload) {
      if (!active) return;
      const st = STEPS[stepIdx];
      if (!st) return;
      if (ev === "summon" && st.action === "summon") {
        setTimeout(advance, 220);
      } else if (ev === "move" && st.action === "move") {
        setTimeout(advance, 220);
      } else if (ev === "wave" && st.action === "wave") {
        // Espera a onda 1 terminar (ou 3.5 s) para ensinar fusão
        $("tutWrap").classList.remove("on");
        waitTimer = setTimeout(() => { if (active && STEPS[stepIdx].id === 4) advance(); }, 4200);
      } else if (ev === "waveClear" && st.id === 4) {
        clearTimeout(waitTimer);
        advance();
      } else if (ev === "fuse" && st.action === "fuse2" && payload && payload.tier >= 2) {
        setTimeout(advance, 350);
      } else if (ev === "meteor" && st.action === "meteor") {
        setTimeout(advance, 850);
      } else if (ev === "fuse" && st.action === "fuse4" && payload) {
        if (payload.tier >= 4) {
          setTimeout(advance, 450);
        } else if (payload.tier === 3) {
          // Já criou o Nível 3; prepara um segundo Nível 3 ao lado para o jogador fundir no Nível 4!
          if (api && api.giveSecondT3) api.giveSecondT3();
          renderStep();
        }
      } else if (ev === "fuse" && st.action === "fuse5" && payload && payload.divine) {
        // Avança para o passo 13 (texto do Deus + limpeza da onda final)
        setupStep(12);
        waitTimer = setTimeout(() => {
          if (active && STEPS[stepIdx] && STEPS[stepIdx].id === 13) finishTutorial(false);
        }, 4200);
      }
    },
    reposition() {
      if (active && STEPS[stepIdx]) positionHighlight(STEPS[stepIdx].target);
    }
  };
})();
