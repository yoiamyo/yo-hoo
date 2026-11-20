/* 景深作品牆引擎（效能版）
 * - 3D 位置由 JS 自己投影成 2D，不用 preserve-3d
 * - 不用即時模糊濾鏡：每張卡片疊一張「預先模糊好的小圖」，景深只調它的透明度
 *   （透明度和位移都只交給顯示卡處理，任何裝置都順）
 * - 遠近明暗用透明度；聚攏時的金色調是一層很淡的色片
 * - 畫面不在視窗內時完全停止運算
 *
 * createDepth({ stage, scrollEl, srcs, blurs, tw, scatterScale, endAt,
 *               target(i, t, ctx, e) => {x,y,z,rx,ry,rz,s,o}, onFrame(p, e, F, t) })
 */
(function () {
  const P = 1100; // 透視距離

  function createDepth(opt) {
    const stage = opt.stage, srcs = opt.srcs, blurs = opt.blurs || [], N = srcs.length;
    let W = stage.clientWidth, H = stage.clientHeight;
    const tw = opt.tw, th = tw * 1.25, ss = opt.scatterScale || 1;
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
    stage.appendChild(box);
    const tint = opt.tint === false ? null : document.createElement('div');
    if (tint) { tint.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;background:#b98f52;opacity:0'; stage.appendChild(tint); }

    const tiles = srcs.map((src, i) => {
      const gx = (i * 0.618034) % 1, gy = ((i * 0.754877) + .13) % 1;
      const z = -1600 + Math.pow(Math.random(), .8) * 2250, sp = 1 + Math.max(0, -z) / 1100;
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;left:0;top:0;width:${tw}px;height:${th}px;border-radius:6px;overflow:hidden;background:#16151a;will-change:transform,opacity`;
      el.innerHTML = `<img src="${src}" alt="" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` +
        (blurs[i] ? `<img src="${blurs[i]}" alt="" decoding="async" style="position:absolute;inset:-4%;width:108%;height:108%;object-fit:cover;opacity:0">` : '');
      box.appendChild(el);
      let sx = (gx - .5) * W * 1.25 * sp + (Math.random() - .5) * 60;
      let sy = (gy - .5) * H * 1.2 * sp + (Math.random() - .5) * 60;
      // 讓出畫面中間放標題的區域（手機版畫面窄，不讓卡片壓在字上）
      if (opt.clearCenter && Math.abs(sy) < H * opt.clearCenter && Math.abs(sx) < W * .45 && z > -900) sy += (sy < 0 ? -1 : 1) * H * opt.clearCenter;
      return {
        el, bl: el.children[1], z, lb: -1, lz: '', lo: '', lt: '',
        sx, sy,
        rx: (Math.random() - .5) * 40, ry: (Math.random() - .5) * 50, rz: (Math.random() - .5) * 24,
      };
    });

    let mx = 0, my = 0, last = 0, F = 0, on = true;
    addEventListener('mousemove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; last = performance.now(); }, { passive: true });
    addEventListener('resize', () => { W = stage.clientWidth; H = stage.clientHeight; });
    new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(opt.scrollEl);
    const ease = t => 1 - Math.pow(1 - t, 3);
    const ctx = { get W() { return W; }, get H() { return H; }, tw, th, N, get mx() { return mx; }, get my() { return my; } };

    function frame(t) {
      requestAnimationFrame(frame);
      if (!on) return;
      const auto = performance.now() - last > 2500;
      const Ft = auto ? Math.sin(t / 2200) * 900 - 450 : (-my * 2) * 1300 - 400;
      F += (Ft - F) * .07;
      const r = opt.scrollEl.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (opt.scrollEl.offsetHeight - innerHeight)));
      const e = ease(Math.min(1, p / (opt.endAt || .78))), k = 1 - e;
      const ax = (my * -10 * k) * Math.PI / 180, ay = (mx * 16 * k) * Math.PI / 180;
      const cax = Math.cos(ax), sax = Math.sin(ax), cay = Math.cos(ay), say = Math.sin(ay);
      const vx = W / 2, vy = H * .45;
      for (let i = 0; i < N; i++) {
        const o = tiles[i], T = opt.target ? opt.target(i, t, ctx, e) : null;
        const tx = T ? T.x : 0, ty = T ? T.y : 0, tz = T ? (T.z || 0) : 0;
        const x = tx * e + o.sx * k, y = ty * e + o.sy * k, z = tz * e + o.z * k;
        const x1 = x * cay + z * say, z1 = -x * say + z * cay;
        const y1 = y * cax - z1 * sax; let z2 = y * sax + z1 * cax;
        if (z2 > P - 80) z2 = P - 80;
        const f = P / (P - z2), s = ((T && T.s) || 1) * e + k * ss;
        const X = vx + x1 * f - tw / 2, Y = vy + (y1 + H * .05) * f - th / 2;
        const rx = ((T && T.rx) || 0) * e + o.rx * k, ry = ((T && T.ry) || 0) * e + o.ry * k, rz = ((T && T.rz) || 0) * e + o.rz * k;
        const tf = `translate(${X.toFixed(1)}px,${Y.toFixed(1)}px) scale(${(s * f).toFixed(3)}) perspective(${P}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
        if (tf !== o.lt) { o.lt = tf; o.el.style.transform = tf; }
        const dim = 1 - Math.min(.55, Math.max(0, -o.z * k) / 3200);
        const op = ((k + ((T && T.o != null) ? T.o : 1) * e) * dim).toFixed(2);
        if (op !== o.lo) { o.lo = op; o.el.style.opacity = op; }
        const zi = String(Math.round(z2 / 20) + 300);           // 只在前後順序真的改變時才更新
        if (zi !== o.lz) { o.lz = zi; o.el.style.zIndex = zi; }
        // 景深：離對焦面越遠，模糊圖越不透明
        if (o.bl) {
          const b = Math.round(Math.min(1, Math.abs(o.z * k - F * k) / 420) * 20) / 20;
          if (b !== o.lb) { o.lb = b; o.bl.style.opacity = b; }
        }
      }
      if (tint) tint.style.opacity = (e * .16).toFixed(3);
      opt.onFrame && opt.onFrame(p, e, F, t);
    }
    requestAnimationFrame(frame);
    return { tiles, ctx };
  }
  window.createDepth = createDepth;
})();
