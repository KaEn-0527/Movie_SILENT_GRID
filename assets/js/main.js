/* ==========================================================================
   SILENT GRID — main.js

   企画書「5. CTA導線・計測設計」「6. デザイン・UX・実装方針」に対応する
   ふるまいをまとめたもの。依存ライブラリなし。

   計測イベント（dataLayer へ push）
     fv_trailer_click / sticky_theater_click / log_continue /
     trailer_to_theater / value_to_schedule / ticket_outbound / stream_outbound
     scroll_depth (25/50/70/90) / trailer_progress (25/50/75/100)
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     helpers
     ---------------------------------------------------------------------- */

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * 計測イベントを送出する。
   * GTM / GA4 が未導入でも動くよう dataLayer への push に統一しておき、
   * 導入時はタグ側で拾う。
   */
  function track(event, params) {
    var payload = Object.assign({ event: event }, params || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    if (typeof window.gtag === 'function') {
      window.gtag('event', event, params || {});
    }
  }

  /** 一時的な通知を画面下部に表示する */
  function toast(message) {
    var el = $('.toast') || (function () {
      var node = document.createElement('div');
      node.className = 'toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
      return node;
    })();

    el.textContent = message;
    // 直前の表示が残っている場合に備えて一度リセットする
    window.clearTimeout(el._timer);
    window.requestAnimationFrame(function () { el.classList.add('is-visible'); });
    el._timer = window.setTimeout(function () { el.classList.remove('is-visible'); }, 2800);
  }

  /* ------------------------------------------------------------------------
     1. ヘッダー：スクロール状態 / 現在セクションのハイライト
     ---------------------------------------------------------------------- */

  var header    = $('#siteHeader');
  var stickyCta = $('#stickyCta');
  var hero      = $('.hero');

  function onScroll() {
    var y = window.scrollY;

    if (header) header.classList.toggle('is-scrolled', y > 40);

    /* 固定CTA：FV を通過してからフッター手前までの間だけ出す。
       常時表示にすると閲覧の邪魔になるため（企画書「画面を覆う巨大UI」を避ける） */
    if (stickyCta) {
      var heroBottom = hero ? hero.offsetHeight - 120 : 400;
      var atBottom   = (window.innerHeight + y) >= (document.body.scrollHeight - 240);
      var show       = y > heroBottom && !atBottom;

      if (show && stickyCta.hidden) stickyCta.hidden = false;
      stickyCta.classList.toggle('is-visible', show);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* 現在地セクションをナビに反映 */
  var navLinks = $$('.nav a');

  if ('IntersectionObserver' in window && navLinks.length) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = '#' + entry.target.id;
        navLinks.forEach(function (link) {
          link.classList.toggle('is-current', link.getAttribute('href') === id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    navLinks.forEach(function (link) {
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (target) sectionObserver.observe(target);
    });
  }

  /* ------------------------------------------------------------------------
     2. モバイルナビ
     ---------------------------------------------------------------------- */

  var navToggle = $('#navToggle');
  var mobileNav = $('#mobileNav');

  if (navToggle && mobileNav) {
    var setNav = function (open) {
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      mobileNav.hidden = !open;
    };

    navToggle.addEventListener('click', function () {
      setNav(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    /* リンク選択後は自動で閉じる */
    $$('a', mobileNav).forEach(function (link) {
      link.addEventListener('click', function () { setNav(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        navToggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------------------
     2-2. ヒーローのイントロ動画
     動画を一度だけ再生し、最終フレームで静止したのちに見出し・CTAを出す。
     容量に配慮し、再生条件を満たさない環境では動画を取得しない。
     ---------------------------------------------------------------------- */

  var heroSection = $('.hero');
  var heroVideo   = $('#heroVideo');
  var heroReveals = $$('.hero .reveal');

  /* イントロ完了：見出し→リード→CTA→公開日の順に立ち上げる
     （段差は CSS の transition-delay 側で付けている） */
  function finishIntro() {
    if (heroSection.classList.contains('is-intro-done')) return;
    heroSection.classList.add('is-intro-done');
    heroReveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /**
   * イントロを再生してよいかを判定する。
   * 通信量・データセーバー・動きの低減を尊重し、該当時は静止KVのみを見せる。
   */
  function shouldPlayIntro() {
    if (!heroVideo || !heroSection) return false;
    if (prefersReducedMotion) return false;

    /* ?intro=0 でスキップ（確認用） */
    if (new URLSearchParams(window.location.search).get('intro') === '0') return false;

    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return false;
      if (/^(slow-2g|2g|3g)$/.test(conn.effectiveType || '')) return false;
    }

    /* 動画を再生できない端末では再生しない */
    return !!heroVideo.canPlayType && heroVideo.canPlayType('video/mp4') !== '';
  }

  if (!heroSection) {
    /* ヒーロー自体がない場合は何もしない */
  } else if (!heroVideo || !shouldPlayIntro()) {
    /* 動画を再生しない：静止KVのまま、見出しはただちに表示する */
    if (heroVideo) heroVideo.remove();
    finishIntro();
  } else {
    (function () {
      var done = false;

      /* 再生が確定した時点で静止KVを伏せる（結末を先に見せない） */
      heroSection.classList.add('is-intro');

      var endIntro = function () {
        if (done) return;
        done = true;

        /* 動画をフェードアウトすると、下の .hero__media（＝最終フレームと
           同じ画像）が現れるため、静止したように見える */
        heroVideo.classList.remove('is-playing');
        if (skipBtn) skipBtn.classList.add('is-gone');

        finishIntro();

        /* フェード完了後に動画を破棄してメモリを解放する */
        window.setTimeout(function () {
          heroVideo.pause();
          heroVideo.removeAttribute('src');
          heroVideo.innerHTML = '';
          heroVideo.load();
          heroVideo.remove();
          if (skipBtn) skipBtn.remove();
        }, 1000);
      };

      /* --- スキップ操作 ---
         5秒間コンテンツを待たせるため、必ず抜け道を用意する */
      var skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'hero__skip';
      skipBtn.textContent = 'SKIP ▶';
      skipBtn.setAttribute('aria-label', 'イントロ映像をスキップ');
      skipBtn.addEventListener('click', function () {
        track('hero_intro_skip', { at: Math.round(heroVideo.currentTime * 10) / 10 });
        endIntro();
      });
      heroSection.appendChild(skipBtn);

      /* --- ソースを注入して読み込み開始 --- */
      /* 画面幅とDPRから配信する版を選ぶ。
         モバイルは縦画面で大きくクロップされるため軽量版で十分。
         VP9版は同容量でもH.264に画質が及ばなかったため採用していない */
      var wide = Math.max(window.innerWidth, window.innerHeight) >= 900;
      var srcAttr = wide ? 'data-src' : 'data-src-sm';
      var url = heroVideo.getAttribute(srcAttr) || heroVideo.getAttribute('data-src');

      var source = document.createElement('source');
      source.src = url;
      source.type = 'video/mp4';
      heroVideo.appendChild(source);

      heroVideo.preload = 'auto';
      heroVideo.load();

      /* 実際に映像が出た時点で初めて表示する。
         is-intro 中は静止KVを伏せているため、これが付かないと
         ヒーローが黒いままになる。取りこぼしを防ぐため複数の契機で付与する */
      var started = false;
      var markPlaying = function () {
        if (started) return;
        started = true;
        window.clearTimeout(guard);
        heroVideo.classList.add('is-playing');
        track('hero_intro_play');
      };

      /* 読み込みが遅い／再生が始まらない場合にコンテンツを人質に取らない。
         4秒で見切りをつけて静止KVへ切り替える。
         canplay では解除せず、実際に再生が始まるまで保険を残す */
      var guard = window.setTimeout(function () {
        if (!started) {
          track('hero_intro_timeout');
          endIntro();
        }
      }, 4000);

      heroVideo.addEventListener('canplay', function () {
        var p = heroVideo.play();
        if (p && p.catch) {
          p.catch(function () {
            /* 自動再生がブロックされた場合は静止KVで進める */
            track('hero_intro_autoplay_blocked');
            endIntro();
          });
        }
      }, { once: true });

      heroVideo.addEventListener('playing', markPlaying);
      heroVideo.addEventListener('play', markPlaying);
      heroVideo.addEventListener('timeupdate', markPlaying);

      heroVideo.addEventListener('ended', endIntro);
      heroVideo.addEventListener('error', function () {
        track('hero_intro_error');
        endIntro();
      });
    })();
  }

  /* ------------------------------------------------------------------------
     3. スクロール表示（reveal）
     ---------------------------------------------------------------------- */

  /* ヒーロー内の要素はイントロ側で制御するため、通常の監視対象から外す */
  var reveals = $$('.reveal').filter(function (el) { return !el.closest('.hero'); });

  if (!('IntersectionObserver' in window) || prefersReducedMotion) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);   // 一度表示したら監視を外す
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ------------------------------------------------------------------------
     3-1. タイプライター演出（FV以降の見出し・ラベル）
     本文まで打ち込むと読了が遅くなるため、見出しとラベルに限定している。
     ---------------------------------------------------------------------- */

  /* [セレクタ, 1文字あたりms, モノスペース用キャレットにするか] */
  var TW_TARGETS = [
    ['.section .label', 26, true],
    ['.section .h2',    42, false],
    ['.quote-mono',     30, true],
    ['.final__logo',    70, true],
    ['.final__h2',      42, false]
  ];

  /**
   * 要素内のテキストを1文字ずつ span で包む。
   * <br> や <em> などの要素は壊さずに再帰する。
   */
  function splitChars(node, chars) {
    var kids = Array.prototype.slice.call(node.childNodes);

    kids.forEach(function (child) {
      if (child.nodeType === 3) {                 // テキストノード
        var text = child.nodeValue;
        if (!text) return;

        var frag = document.createDocumentFragment();
        for (var i = 0; i < text.length; i++) {
          var span = document.createElement('span');
          span.className = 'tw-c';
          span.textContent = text[i];
          frag.appendChild(span);
          chars.push(span);
        }
        node.replaceChild(frag, child);

      } else if (child.nodeType === 1 && !child.classList.contains('label__rule')) {
        splitChars(child, chars);                 // 装飾罫線は対象外
      }
    });

    return chars;
  }

  /* 準備は同期的に行う。main.js は </body> 直前で読まれるため、
     初回描画より前に文字が伏せられ、全文が一瞬見えるのを防げる */
  var twItems = [];

  TW_TARGETS.forEach(function (t) {
    $$(t[0]).forEach(function (el) {
      if (el.dataset.twReady) return;

      var chars = splitChars(el, []);
      if (!chars.length) return;

      el.dataset.twReady = '1';
      el.classList.add('tw');
      if (t[2]) el.classList.add('tw--mono');

      twItems.push({ el: el, chars: chars, step: t[1] });
    });
  });

  /** 全文字を即座に表示する（動きの低減／打ち終わり） */
  function twFinish(item) {
    item.chars.forEach(function (c) {
      c.classList.add('is-on');
      c.classList.remove('is-cursor');
    });
  }

  /** 1文字ずつ点灯させ、キャレットを先頭に追従させる */
  function twPlay(item) {
    var i = 0;
    var last = null;
    var prev = 0;

    var tick = function (now) {
      if (!prev) prev = now;

      /* 経過時間から進めるべき文字数を算出（低フレームレートでも破綻しない） */
      while (now - prev >= item.step && i < item.chars.length) {
        prev += item.step;
        var c = item.chars[i++];
        c.classList.add('is-on');
        if (last) last.classList.remove('is-cursor');
        c.classList.add('is-cursor');
        last = c;
      }

      if (i < item.chars.length) {
        window.requestAnimationFrame(tick);
      } else if (last) {
        /* 打ち終わったらキャレットを消す（常時点滅させない） */
        window.setTimeout(function () { last.classList.remove('is-cursor'); }, 420);
      }
    };

    window.requestAnimationFrame(tick);
  }

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    twItems.forEach(twFinish);
  } else {
    var twObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);

        var item = twItems.filter(function (t) { return t.el === entry.target; })[0];
        if (item) twPlay(item);
      });
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.2 });

    twItems.forEach(function (item) { twObserver.observe(item.el); });
  }

  /* ------------------------------------------------------------------------
     3-2. セクション背景の遅延読込
     背景PNGが大きいため、near-viewport になるまで読み込まない。
     ---------------------------------------------------------------------- */

  var bgSections = $$('.section');

  if (!('IntersectionObserver' in window)) {
    bgSections.forEach(function (el) { el.classList.add('is-bg'); });
  } else {
    var bgObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-bg');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '300px 0px' });   // 到達前に読み始めて切替を目立たせない

    bgSections.forEach(function (el) { bgObserver.observe(el); });
  }

  /* ------------------------------------------------------------------------
     4. 開閉UI（キャラクター詳細 / GRID SYSTEM アコーディオン）
     ---------------------------------------------------------------------- */

  /**
   * aria-controls で結ばれたパネルを開閉する共通処理。
   * @param {HTMLElement} btn
   * @param {function}    [onToggle] 開閉後のラベル更新など
   */
  function bindDisclosure(btn, onToggle) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (onToggle) onToggle(open);
    });
  }

  /* キャラクター：ラベルを開閉状態に合わせて差し替える */
  $$('.charcard__toggle').forEach(function (btn) {
    var label = $('[data-open-label]', btn);
    var openText  = label ? label.textContent.trim() : '';
    var closeText = '閉じる ▲';

    bindDisclosure(btn, function (open) {
      if (label) label.textContent = open ? closeText : openText;

      var card = btn.closest('[data-char]');
      var name = card ? ($('.charcard__name', card) || {}).textContent : '';
      if (open) track('character_expand', { character: (name || '').trim() });
    });
  });

  /* GRID SYSTEM アコーディオン */
  $$('.acc__btn').forEach(function (btn) {
    bindDisclosure(btn, function (open) {
      if (!open) return;
      var title = ($('span', btn) || {}).textContent || '';
      track('grid_accordion_open', { item: title.trim() });
    });
  });

  /* ------------------------------------------------------------------------
     5. モーダル基盤（フォーカストラップ付き）
     ---------------------------------------------------------------------- */

  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function createModal(root) {
    if (!root) return null;

    var dialog  = $('.modal__dialog', root);
    var lastFocused = null;

    function trap(e) {
      if (e.key !== 'Tab') return;

      var items = $$(FOCUSABLE, dialog).filter(function (el) {
        return el.offsetParent !== null;   // 非表示要素は対象外
      });
      if (!items.length) return;

      var first = items[0];
      var last  = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { api.close(); return; }
      trap(e);
    }

    var api = {
      open: function () {
        lastFocused = document.activeElement;
        root.hidden = false;
        document.body.classList.add('is-locked');
        document.addEventListener('keydown', onKeydown);

        /* 開いた直後は閉じるボタンにフォーカスを移す */
        var focusTarget = $('.modal__close', dialog) || dialog;
        window.requestAnimationFrame(function () { focusTarget.focus(); });
      },

      close: function () {
        root.hidden = true;
        document.body.classList.remove('is-locked');
        document.removeEventListener('keydown', onKeydown);
        if (lastFocused && lastFocused.focus) lastFocused.focus();
      },

      root: root
    };

    return api;
  }

  /* ------------------------------------------------------------------------
     6. 予告モーダル
     ---------------------------------------------------------------------- */

  var trailerModal = createModal($('#trailerModal'));

  if (trailerModal) {
    $$('[data-trailer-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        trailerModal.open();
        track(btn.getAttribute('data-track') || 'fv_trailer_click', {
          location: btn.closest('.hero') ? 'fv'
                  : btn.closest('.sticky-cta') ? 'sticky'
                  : 'trailer_section'
        });
        startTrailerTracking();
      });
    });

    $$('[data-trailer-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        trailerModal.close();
        stopTrailerTracking();
      });
    });
  }

  /* 予告の視聴進捗（KPI1-2「25/50/75/100%視聴」）
     動画素材の支給後、#trailerModal 内の <video> / YouTube iframe に接続する。
     現時点ではプレースホルダーのため video 要素があるときのみ計測する。 */
  var trailerMilestones = [25, 50, 75, 100];
  var trailerSeen = [];
  var trailerVideo = null;

  function onTrailerTimeUpdate() {
    if (!trailerVideo || !trailerVideo.duration) return;
    var pct = (trailerVideo.currentTime / trailerVideo.duration) * 100;

    trailerMilestones.forEach(function (m) {
      if (pct >= m && trailerSeen.indexOf(m) === -1) {
        trailerSeen.push(m);
        track('trailer_progress', { percent: m });
      }
    });
  }

  function startTrailerTracking() {
    trailerVideo = $('#trailerVideo');
    if (!trailerVideo) return;

    /* 開いたときに初めて読み込む（閉じている間は取得しない） */
    if (!trailerVideo.getAttribute('src')) {
      var src = trailerVideo.getAttribute('data-src');
      if (src) {
        trailerVideo.setAttribute('src', src);
        trailerVideo.load();
      }
    }

    trailerSeen = [];
    trailerVideo.addEventListener('timeupdate', onTrailerTimeUpdate);
    var playing = trailerVideo.play();
    if (playing && playing.catch) playing.catch(function () { /* 自動再生拒否は無視 */ });
  }

  function stopTrailerTracking() {
    if (!trailerVideo) return;
    trailerVideo.removeEventListener('timeupdate', onTrailerTimeUpdate);
    trailerVideo.pause();
    trailerVideo = null;
  }

  /* ------------------------------------------------------------------------
     6-2. 場面写真のライトボックス
     サムネイルをクリックするとオーバーレイで拡大表示する。
     閉じるのは右上の × / 背景クリック / ESC。前後移動は ← → キーにも対応。
     ---------------------------------------------------------------------- */

  var lightboxModal = createModal($('#lightboxModal'));
  var galleryBtns   = $$('.gallery__btn');

  if (lightboxModal && galleryBtns.length) {
    var lbImg   = $('#lightboxImg');
    var lbCap   = $('#lightboxCap');
    var lbCount = $('#lightboxCount');
    var lbIndex = 0;

    var showAt = function (i) {
      /* 端で止めず循環させる */
      lbIndex = (i + galleryBtns.length) % galleryBtns.length;

      var btn = galleryBtns[lbIndex];
      var img = $('img', btn);

      lbImg.src = img.getAttribute('src');
      lbImg.alt = img.getAttribute('alt') || '';
      lbCap.textContent = btn.getAttribute('data-caption') || '';
      lbCount.textContent = (lbIndex + 1) + ' / ' + galleryBtns.length;
    };

    galleryBtns.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        showAt(i);
        lightboxModal.open();
        track('gallery_open', { index: i + 1 });
      });
    });

    var prevBtn = $('#lightboxPrev');
    var nextBtn = $('#lightboxNext');
    if (prevBtn) prevBtn.addEventListener('click', function () { showAt(lbIndex - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { showAt(lbIndex + 1); });

    $$('[data-lightbox-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { lightboxModal.close(); });
    });

    /* 表示中のみ左右キーを拾う（ESC はモーダル側で処理済み） */
    document.addEventListener('keydown', function (e) {
      if ($('#lightboxModal').hidden) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); showAt(lbIndex + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); showAt(lbIndex - 1); }
    });
  }

  /* ------------------------------------------------------------------------
     7. 外部遷移の確認モーダル
     企画書「外部遷移前の一文で摩擦・体験断絶を抑える」
     ---------------------------------------------------------------------- */

  var outboundModal = createModal($('#outboundModal'));
  var outboundGo    = $('#outboundGo');

  /**
   * 配下の [data-outbound] に確認モーダルを紐づける。
   * 上映館リストのように後から生成される要素にも適用できるよう関数化している。
   */
  function bindOutbound(root) {
    if (!outboundModal) return;

    $$('[data-outbound]', root).forEach(function (link) {
      if (link.dataset.outboundBound) return;   // 二重バインド防止
      link.dataset.outboundBound = '1';

      link.addEventListener('click', function (e) {
        var href = link.getAttribute('href');

        /* 遷移先URLが未設定（"#"）の場合は誤遷移させない */
        var resolved = (!href || href === '#') ? null : href;

        e.preventDefault();

        var eventName = link.getAttribute('data-track') || 'ticket_outbound';
        var isStream  = eventName === 'stream_outbound';

        var text = $('#outboundTitle');
        if (text) {
          text.textContent = isStream
            ? '配信サービスのページを開きます。もう一度、あの3日間を復元してください。'
            : '選択した劇場のチケットページを開きます。上映日時を確認して、最後の記憶を劇場で確かめてください。';
        }

        if (outboundGo) {
          if (resolved) {
            outboundGo.setAttribute('href', resolved);
            outboundGo.setAttribute('target', '_blank');
            outboundGo.setAttribute('rel', 'noopener noreferrer');
            outboundGo.removeAttribute('aria-disabled');
            outboundGo.textContent = '開く';
          } else {
            outboundGo.setAttribute('href', '#');
            outboundGo.setAttribute('aria-disabled', 'true');
            outboundGo.textContent = '準備中';
          }

          outboundGo.onclick = function (ev) {
            if (!resolved) {
              ev.preventDefault();
              toast('このリンクは準備中です');
              return;
            }
            track(eventName, { url: resolved });
            outboundModal.close();
          };
        }

        outboundModal.open();
      });
    });
  }

  bindOutbound(document);

  if (outboundModal) {
    $$('[data-outbound-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { outboundModal.close(); });
    });
  }

  /* ------------------------------------------------------------------------
     8. 上映館検索
     ---------------------------------------------------------------------- */

  /**
   * 上映館データ（架空）。
   * 実運用では CMS / チケットAPI のレスポンスに差し替える。
   *   { name, address, times[], url, formats[] }
   */
  var THEATER_DATA = {
    hokkaido: [
      { name: 'メトロシネマ札幌', address: '北海道札幌市中央区北4条西2-1', times: ['10:20', '14:05', '18:40'], formats: ['IMAX®'], url: 'https://ticket.example.jp/silent-grid/sapporo' },
      { name: 'シネマグリッド仙台', address: '宮城県仙台市青葉区中央3-7-2', times: ['11:00', '15:30', '19:15'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/sendai' },
      { name: 'ノクティスシネマ盛岡', address: '岩手県盛岡市大通2-4-9', times: ['12:40', '17:20'], formats: [], url: 'https://ticket.example.jp/silent-grid/morioka' }
    ],
    kanto: [
      { name: 'メトロシネマ新宿', address: '東京都新宿区歌舞伎町1-19-1', times: ['09:50', '12:30', '15:10', '18:50', '21:30'], formats: ['IMAX®', 'Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/shinjuku' },
      { name: 'グリッドシネマ豊洲', address: '東京都江東区豊洲2-4-9', times: ['10:15', '13:40', '17:05', '20:30'], formats: ['4DX'], url: 'https://ticket.example.jp/silent-grid/toyosu' },
      { name: 'シネマトーキョー渋谷', address: '東京都渋谷区道玄坂2-6-17', times: ['11:20', '14:55', '18:30', '22:00'], formats: ['字幕'], url: 'https://ticket.example.jp/silent-grid/shibuya' },
      { name: 'ノクティスシネマ横浜みなとみらい', address: '神奈川県横浜市西区みなとみらい3-5-1', times: ['10:40', '14:20', '18:00'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/mm21' }
    ],
    chubu: [
      { name: 'メトロシネマ名古屋栄', address: '愛知県名古屋市中区栄3-5-12', times: ['10:30', '14:10', '17:50', '21:20'], formats: ['IMAX®'], url: 'https://ticket.example.jp/silent-grid/sakae' },
      { name: 'グリッドシネマ静岡', address: '静岡県静岡市葵区紺屋町11-1', times: ['11:45', '16:20'], formats: [], url: 'https://ticket.example.jp/silent-grid/shizuoka' },
      { name: 'シネマ金沢ポルテ', address: '石川県金沢市広岡1-5-3', times: ['12:10', '16:40'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/kanazawa' }
    ],
    kansai: [
      { name: 'メトロシネマ梅田', address: '大阪府大阪市北区角田町5-15', times: ['09:40', '13:15', '16:50', '20:25'], formats: ['IMAX®', '4DX'], url: 'https://ticket.example.jp/silent-grid/umeda' },
      { name: 'グリッドシネマなんば', address: '大阪府大阪市中央区難波2-3-8', times: ['10:50', '14:30', '18:10', '21:45'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/namba' },
      { name: 'シネマ京都四条', address: '京都府京都市下京区四条通室町東入', times: ['11:30', '15:05', '18:40'], formats: ['字幕'], url: 'https://ticket.example.jp/silent-grid/kyoto' },
      { name: 'ノクティスシネマ神戸ハーバー', address: '兵庫県神戸市中央区東川崎町1-7-2', times: ['12:00', '16:35'], formats: [], url: 'https://ticket.example.jp/silent-grid/kobe' }
    ],
    chugoku: [
      { name: 'メトロシネマ広島', address: '広島県広島市中区基町6-27', times: ['10:25', '14:00', '17:40'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/hiroshima' },
      { name: 'グリッドシネマ岡山', address: '岡山県岡山市北区下石井1-2-1', times: ['11:15', '15:45', '19:20'], formats: [], url: 'https://ticket.example.jp/silent-grid/okayama' },
      { name: 'シネマ高松サンポート', address: '香川県高松市サンポート2-1', times: ['12:35', '17:10'], formats: [], url: 'https://ticket.example.jp/silent-grid/takamatsu' }
    ],
    kyushu: [
      { name: 'メトロシネマ博多', address: '福岡県福岡市博多区住吉1-2-25', times: ['10:05', '13:45', '17:25', '21:00'], formats: ['IMAX®'], url: 'https://ticket.example.jp/silent-grid/hakata' },
      { name: 'グリッドシネマ天神', address: '福岡県福岡市中央区天神2-11-3', times: ['11:40', '15:20', '19:00'], formats: ['4DX'], url: 'https://ticket.example.jp/silent-grid/tenjin' },
      { name: 'シネマ熊本サクラマチ', address: '熊本県熊本市中央区桜町3-10', times: ['12:20', '16:50'], formats: [], url: 'https://ticket.example.jp/silent-grid/kumamoto' },
      { name: 'ノクティスシネマ那覇', address: '沖縄県那覇市おもろまち4-4-9', times: ['13:10', '18:20'], formats: ['Dolby Atmos'], url: 'https://ticket.example.jp/silent-grid/naha' }
    ]
  };

  var REGION_LABEL = {
    hokkaido: '北海道・東北',
    kanto:    '関東',
    chubu:    '中部',
    kansai:   '近畿',
    chugoku:  '中国・四国',
    kyushu:   '九州・沖縄'
  };

  var regionSelect  = $('#regionSelect');
  var theaterResult = $('#theaterResult');
  var geoBtn        = $('#geoBtn');

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderTheaters(region) {
    if (!theaterResult) return;

    var list  = THEATER_DATA[region] || [];
    var label = REGION_LABEL[region] || '';

    theaterResult.setAttribute('data-empty', list.length ? 'false' : 'true');

    if (!list.length) {
      theaterResult.innerHTML =
        '<p class="theater__count">' + escapeHtml(label) + '</p>' +
        '<p class="theater__hint">' + escapeHtml(label) +
        'の上映館は準備中です。他の地域を選択してください。</p>';
      return;
    }

    var rows = list.map(function (t) {
      var times = (t.times || []).map(function (time) {
        return '<span class="theater__time">' + escapeHtml(time) + '</span>';
      }).join('');

      /* 上映方式は劇場名とは別の要素にする（読み上げが連結しないように） */
      var formats = (t.formats || []).length
        ? '<p class="theater__formats">' + t.formats.map(function (f) {
            return '<span class="theater__format">' + escapeHtml(f) + '</span>';
          }).join('') + '</p>'
        : '';

      return '' +
        '<div class="theater__item">' +
          '<div>' +
            '<p class="theater__name">' + escapeHtml(t.name) + '</p>' +
            '<p class="theater__addr">' + escapeHtml(t.address || '') + '</p>' +
            formats +
          '</div>' +
          '<div class="theater__times">' + times + '</div>' +
          '<a class="btn btn--primary btn--sm" href="' + escapeHtml(t.url || '#') + '" ' +
             'data-track="ticket_outbound" data-outbound>チケットを取る</a>' +
        '</div>';
    }).join('');

    theaterResult.innerHTML =
      '<p class="theater__count">' + escapeHtml(label) + ' / ' + list.length + '館　本日の上映時間　一般 2,000円</p>' +
      '<div class="theater__list">' + rows + '</div>';

    /* 生成した「チケットを取る」にも外部遷移の確認を効かせる */
    bindOutbound(theaterResult);
  }

  if (regionSelect) {
    regionSelect.addEventListener('change', function () {
      var region = regionSelect.value;
      if (!region) return;

      renderTheaters(region);
      track('theater_region_select', { region: REGION_LABEL[region] || region });
    });
  }

  if (geoBtn) {
    geoBtn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        toast('この環境では現在地を取得できません');
        return;
      }

      var original = geoBtn.textContent;
      geoBtn.textContent = '取得中…';
      geoBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        function (pos) {
          geoBtn.textContent = original;
          geoBtn.disabled = false;

          var region = regionFromCoords(pos.coords.latitude, pos.coords.longitude);

          track('theater_geo_search', {
            lat: Number(pos.coords.latitude.toFixed(2)),
            lng: Number(pos.coords.longitude.toFixed(2)),
            region: REGION_LABEL[region] || region
          });

          /* セレクトも合わせて更新し、どの地域が選ばれたか分かるようにする */
          if (regionSelect) regionSelect.value = region;
          renderTheaters(region);
          toast('現在地から「' + (REGION_LABEL[region] || region) + '」を表示しました');
        },
        function () {
          geoBtn.textContent = original;
          geoBtn.disabled = false;
          toast('現在地を取得できませんでした');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  /**
   * 緯度経度からおおまかな地域を判定する（簡易版）。
   * 実運用では劇場検索APIに緯度経度を渡し、距離順で返す想定。
   */
  function regionFromCoords(lat, lng) {
    if (lat >= 37.4) return 'hokkaido';
    if (lng < 131.4) return 'kyushu';
    if (lng < 134.4) return 'chugoku';
    if (lng < 136.2) return 'kansai';
    if (lng < 138.4) return 'chubu';
    return 'kanto';
  }

  /* 「上映館を選ぶ」：未選択なら選択を促し、選択済みなら結果へ誘導する */
  var pickTheater = $('#pickTheater');

  if (pickTheater) {
    pickTheater.addEventListener('click', function (e) {
      e.preventDefault();

      if (regionSelect && !regionSelect.value) {
        toast('地域を選択してください');
        regionSelect.focus();
        return;
      }

      track('theater_list_focus', { region: regionSelect ? regionSelect.value : '' });

      /* 最初の劇場のチケットボタンへフォーカスを送る */
      var firstTicket = theaterResult && $('[data-outbound]', theaterResult);
      if (firstTicket) {
        theaterResult.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
        firstTicket.focus({ preventScroll: true });
      }
    });
  }

  /* ------------------------------------------------------------------------
     9. 公開フェーズ切替（劇場公開 / 配信）
     ---------------------------------------------------------------------- */

  var phaseTabs = $$('.phase [role="tab"]');

  if (phaseTabs.length) {
    var activatePhase = function (name) {
      phaseTabs.forEach(function (tab) {
        var on = tab.getAttribute('data-phase') === name;
        tab.setAttribute('aria-selected', String(on));
        tab.classList.toggle('is-active', on);
        tab.tabIndex = on ? 0 : -1;
      });

      $$('[data-phase-panel]').forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-phase-panel') !== name;
      });

      track('phase_switch', { phase: name });
    };

    phaseTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activatePhase(tab.getAttribute('data-phase'));
      });

      /* タブは左右キーで移動できるようにする（WAI-ARIA タブパターン） */
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();

        var i    = phaseTabs.indexOf(tab);
        var next = phaseTabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + phaseTabs.length) % phaseTabs.length];

        next.focus();
        activatePhase(next.getAttribute('data-phase'));
      });
    });

    /* ?phase=stream で配信フェーズを初期表示（公開後の切替を想定） */
    var phaseParam = new URLSearchParams(window.location.search).get('phase');
    if (phaseParam === 'stream') activatePhase('stream');
  }

  /* ------------------------------------------------------------------------
     10. 共有
     ---------------------------------------------------------------------- */

  var shareBtn = $('#shareBtn');

  if (shareBtn) {
    var SHARE = {
      title: 'SILENT GRID｜映画公式サイト',
      text:  'この街では、すべての記憶が監視されている。彼女との最後の3日間だけが、消されていた。 #SILENTGRID',
      url:   window.location.origin + window.location.pathname
    };

    shareBtn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share(SHARE)
          .then(function () { track('share', { method: 'web_share' }); })
          .catch(function () { /* ユーザーによるキャンセルは無視 */ });
        return;
      }

      /* Web Share 非対応環境はクリップボードへコピー */
      var fallback = SHARE.text + '\n' + SHARE.url;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fallback).then(function () {
          toast('URLをコピーしました');
          track('share', { method: 'clipboard' });
        }).catch(function () {
          toast('コピーできませんでした');
        });
      } else {
        toast('お使いのブラウザでは共有できません');
      }
    });
  }

  /* ------------------------------------------------------------------------
     11. CTA クリックの計測（data-track を持つ要素をまとめて拾う）
     ---------------------------------------------------------------------- */

  $$('[data-track]').forEach(function (el) {
    /* 予告・外部遷移は個別ハンドラで送出済みのため二重計測を避ける */
    if (el.hasAttribute('data-trailer-open') || el.hasAttribute('data-outbound')) return;

    el.addEventListener('click', function () {
      track(el.getAttribute('data-track'), {
        label: (el.textContent || '').trim().slice(0, 40)
      });
    });
  });

  /* ------------------------------------------------------------------------
     12. スクロール到達率（KPI1-1：25 / 50 / 70 / 90%）
     ---------------------------------------------------------------------- */

  var depths = [25, 50, 70, 90];
  var reached = [];
  var ticking = false;

  function measureDepth() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;

    var pct = (window.scrollY / scrollable) * 100;

    depths.forEach(function (d) {
      if (pct >= d && reached.indexOf(d) === -1) {
        reached.push(d);
        track('scroll_depth', { percent: d });
      }
    });

    /* 全段階に到達したらリスナーを解除する */
    if (reached.length === depths.length) {
      window.removeEventListener('scroll', onDepthScroll);
    }
  }

  function onDepthScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      measureDepth();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onDepthScroll, { passive: true });

  /* ------------------------------------------------------------------------
     13. 滞在時間（KPI1：平均滞在 2分30秒）
     ---------------------------------------------------------------------- */

  var startedAt = Date.now();
  var engagementSent = false;

  /* 離脱時に滞在秒数を送る。visibilitychange は
     モバイルで pagehide より確実に発火するため併用する */
  function sendEngagement() {
    if (engagementSent) return;
    engagementSent = true;

    track('engagement_time', {
      seconds: Math.round((Date.now() - startedAt) / 1000),
      max_scroll: reached.length ? Math.max.apply(null, reached) : 0
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendEngagement();
  });
  window.addEventListener('pagehide', sendEngagement);

  /* ------------------------------------------------------------------------
     14. メモリログの復元演出
     企画書「モーション：ログ復元、音の途切れ、一瞬の欠落に限定」
     ---------------------------------------------------------------------- */

  /* ------------------------------------------------------------------------
     14-2. 記憶ログの復元演出
     「記憶ログを復元する」を押すと、欠落した3日分の領域に文字が打ち込まれる。
     大半は文字化けし、断片的な単語だけが読み取れる、という見せ方にしている。
     ---------------------------------------------------------------------- */

  /* 文字化け用のグリフ。UTF-8→Shift_JIS の典型的な化け方に寄せている */
  var GLITCH = '郢晢ｽｻ縺ｮ闕ｳ閧ｴ蝣ｴ謇髴髢｢繝荳肴枚蟄怜喧郤ｨ蜿ｽ譁ｰ迴ｾ蠑ｷ蛻ｶ蜷榊燕▓▒░█◆◇※§¤†‡0123456789ABCDEF';

  /* 読み取れる単語の色分け。企画書の配色方針に合わせている
     sys  = シアン（システム側）／ warm = 淡い暖色（ミサキの記憶）／ name = 人物 */
  var TONE = {
    '東京': 'sys', 'GRID SYSTEM': 'sys', 'メトロポリス': 'sys', '監視': 'sys',
    'ハルト': 'name',
    'ミサキ': 'warm', '記憶': 'warm', '事故': 'warm', '約束': 'warm'
  };

  /* h=見出し行 / g=文字化けの文字数 / r=読める単語 / e=エラー行 */
  var RESTORE_LINES = [
    [ /* 02.12 */
      [{ h: '> RESTORE 02.12' }],
      [{ g: 4 }, { r: '東京' }, { g: 5 }, { r: '監視' }, { g: 2 }],
      [{ g: 3 }, { r: '記憶' }, { g: 6 }, { h: ' 03:14' }],
      [{ g: 5 }, { r: 'ハルト' }, { g: 4 }],
      [{ e: 'ERR: 47% CORRUPT' }]
    ],
    [ /* 02.13 */
      [{ h: '> RESTORE 02.13' }],
      [{ g: 2 }, { r: 'GRID SYSTEM' }, { g: 4 }],
      [{ g: 5 }, { r: 'ミサキ' }, { g: 3 }, { r: '約束' }, { g: 2 }],
      [{ g: 4 }, { r: 'メトロポリス' }, { g: 3 }],
      [{ e: 'ERR: 61% CORRUPT' }]
    ],
    [ /* 02.14 */
      [{ h: '> RESTORE 02.14' }],
      [{ g: 3 }, { r: 'ハルト' }, { g: 2 }, { r: 'ミサキ' }, { g: 4 }],
      [{ g: 5 }, { r: '事故' }, { g: 3 }, { r: '東京' }, { g: 2 }],
      [{ g: 2 }, { r: 'GRID SYSTEM' }, { h: ' ACCESS DENIED' }],
      [{ e: 'ERR: 88% CORRUPT' }]
    ]
  ];

  var randGlitch = function () {
    return GLITCH.charAt(Math.floor(Math.random() * GLITCH.length));
  };

  /**
   * 1枚のカードぶんの文字要素を組み立てる。
   * 戻り値は打ち込み対象の文字リスト（改行は即時配置し打ち込み対象から外す）。
   */
  function buildRestore(container, lines) {
    var seq = [];
    container.textContent = '';

    lines.forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'rst__line';

      line.forEach(function (tok) {
        var text, cls;

        if (tok.h)      { text = tok.h;      cls = 'rst-h'; }
        else if (tok.e) { text = tok.e;      cls = 'rst-e'; }
        else if (tok.r) { text = tok.r;      cls = 'rst-r rst-r--' + (TONE[tok.r] || 'sys'); }
        else            { text = new Array(tok.g + 1).join(' '); cls = 'rst-g'; }

        for (var i = 0; i < text.length; i++) {
          var span = document.createElement('span');
          span.className = 'rst-c ' + cls;
          /* 確定後の文字。文字化け部分はランダムなグリフを最終形とする */
          span.dataset.ch = tok.g ? randGlitch() : text[i];
          span.textContent = '';
          p.appendChild(span);
          seq.push(span);
        }
      });

      container.appendChild(p);
    });

    return seq;
  }

  /**
   * 文字列を1つずつ確定させる。
   * 読める単語だけは数回スクランブルさせてから定着させ、
   * ノイズの中から浮かび上がるように見せる。
   */
  function playRestore(seq, step, done) {
    var i = 0;
    var prev = 0;

    var tick = function (now) {
      if (!prev) prev = now;

      while (now - prev >= step && i < seq.length) {
        prev += step;

        (function (span) {
          span.classList.add('is-on');

          if (span.classList.contains('rst-r')) {
            /* 読める単語：3回スクランブルしてから確定 */
            var n = 0;
            var scramble = window.setInterval(function () {
              if (n++ >= 3) {
                window.clearInterval(scramble);
                span.textContent = span.dataset.ch;
                span.classList.add('is-locked');
                return;
              }
              span.textContent = randGlitch();
            }, 45);
          } else {
            span.textContent = span.dataset.ch;
          }
        })(seq[i++]);
      }

      if (i < seq.length) {
        window.requestAnimationFrame(tick);
      } else if (done) {
        window.setTimeout(done, 260);
      }
    };

    window.requestAnimationFrame(tick);
  }

  var restoreBtn = $('#restoreBtn');
  var restoreRun = false;   // 実行済みなら通常のアンカーとして動かす

  if (restoreBtn) {
    restoreBtn.addEventListener('click', function (e) {
      if (restoreRun) return;            // 2回目以降は #story へ普通に遷移
      e.preventDefault();
      restoreRun = true;

      var panels = $$('[data-restore]');
      var status = $('[data-scan]');
      var pending = panels.length;

      if (status) {
        status.textContent = 'RESTORING';
        status.style.color = 'var(--cyan)';
      }
      restoreBtn.classList.add('is-busy');
      restoreBtn.textContent = '復元中…';
      track('log_continue', { action: 'restore_start' });

      var goStory = function () {
        var story = document.getElementById('story');
        if (!story) return;
        story.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      };

      var finishAll = function () {
        if (--pending > 0) return;

        if (status) {
          status.textContent = 'PARTIAL RECOVERY';
          status.style.color = 'var(--warm)';
        }

        /* 断片だけ戻った、という結果をカード側にも反映する */
        $$('.daycard__err').forEach(function (el) {
          el.textContent = 'FRAGMENT RECOVERED';
          el.classList.add('is-partial');
        });

        var summary = $('#restoreSummary');
        if (summary) {
          summary.textContent =
            '記憶ログの復元を試みました。大半のデータは破損しています。' +
            '読み取れた断片：東京、監視、記憶、ハルト、GRID SYSTEM、ミサキ、約束、メトロポリス、事故。';
        }

        restoreBtn.classList.remove('is-busy');
        restoreBtn.textContent = 'ストーリーへ進む';
        track('log_continue', { action: 'restore_complete' });

        /* 復元の続き＝物語へ、という流れでストーリーへ送る */
        window.setTimeout(goStory, 900);
      };

      panels.forEach(function (panel, idx) {
        var seq = buildRestore(panel, RESTORE_LINES[idx] || RESTORE_LINES[0]);
        panel.classList.add('is-active');

        if (prefersReducedMotion) {
          /* 動きの低減：打ち込まず即座に確定させる */
          seq.forEach(function (s) {
            s.textContent = s.dataset.ch;
            s.classList.add('is-on', 'is-locked');
          });
          finishAll();
          return;
        }

        /* カードごとに開始をずらして、順に走査されているように見せる */
        window.setTimeout(function () {
          playRestore(seq, 26, finishAll);
        }, idx * 320);
      });
    });
  }

  var scanStatus = $('[data-scan]');

  if (scanStatus && !prefersReducedMotion && 'IntersectionObserver' in window) {
    var scanObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);

        /* SCANNING → RESTORE FAILED。
           復元を試みて失敗する、という一度きりの流れにする。
           先に「記憶ログを復元する」が押されていた場合は、
           そちらの表示（RESTORING / PARTIAL RECOVERY）を上書きしない */
        window.setTimeout(function () {
          if (restoreRun) return;
          scanStatus.textContent = 'RESTORE FAILED';
          scanStatus.style.color = 'var(--red)';
        }, 2600);
      });
    }, { threshold: 0.5 });

    scanObserver.observe(scanStatus);
  }
})();
