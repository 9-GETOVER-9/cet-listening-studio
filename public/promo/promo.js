const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function splitLines(selector) {
  document.querySelectorAll(selector).forEach((heading) => {
    const lines = heading.innerHTML
      .split('<br>')
      .map((line) => line.trim())
      .filter(Boolean)

    heading.innerHTML = lines
      .map((line) => {
        const words = line
          .split(' ')
          .map((word) => `<span class="word">${word}</span>`)
          .join(' ')
        return `<span class="line">${words}</span>`
      })
      .join('')
  })
}

function initSharedAnimations() {
  if (!window.gsap || prefersReducedMotion) return

  gsap.defaults({ duration: 0.72, ease: 'power3.out' })
  splitLines('.headline, .reel-title')

  const mm = gsap.matchMedia()

  mm.add(
    {
      reduceMotion: '(prefers-reduced-motion: reduce)',
      fullMotion: '(prefers-reduced-motion: no-preference)',
    },
    (context) => {
      const { fullMotion } = context.conditions
      if (!fullMotion) return

      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro
        .from('.brand, .nav-links, .nav .button', { y: -18, autoAlpha: 0, stagger: 0.08 })
        .from('.eyebrow', { y: 18, autoAlpha: 0 }, '<0.1')
        .from('.headline .word, .reel-title .word', {
          yPercent: 110,
          rotation: 2,
          stagger: { each: 0.045, from: 'start' },
          duration: 0.86,
        }, '<0.08')
        .from('.subhead, .reel-copy', { y: 22, autoAlpha: 0 }, '<0.22')
        .from('.hero-actions .button, .hero-actions .ghost-button', { y: 16, autoAlpha: 0, stagger: 0.08 }, '<0.12')
        .from('.stat', { y: 24, autoAlpha: 0, stagger: 0.09 }, '<0.12')
        .from('.phone-frame, .reel-visual', { y: 30, rotationY: -8, autoAlpha: 0, duration: 0.9 }, '<0.02')

      gsap.from('.lesson-card', {
        y: 28,
        autoAlpha: 0,
        stagger: 0.12,
        duration: 0.68,
        delay: 0.45,
      })

      gsap.fromTo('.progress-fill', { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut', delay: 0.9 })

      document.querySelectorAll('[data-reveal]').forEach((item) => {
        gsap.from(item, {
          y: 44,
          autoAlpha: 0,
          duration: 0.84,
          scrollTrigger: {
            trigger: item,
            start: 'top 82%',
            toggleActions: 'play none none reverse',
          },
        })
      })

      gsap.from('.feature-item', {
        x: -24,
        autoAlpha: 0,
        stagger: 0.12,
        scrollTrigger: {
          trigger: '.feature-list',
          start: 'top 76%',
          toggleActions: 'play none none reverse',
        },
      })

      if (document.querySelector('.rail')) {
        const rail = document.querySelector('.rail')
        gsap.to(rail, {
          x: () => Math.min(0, window.innerWidth - rail.scrollWidth - 24),
          ease: 'none',
          scrollTrigger: {
            trigger: '.horizontal-stage',
            start: 'top top',
            end: '+=1400',
            scrub: 1,
            pin: true,
          },
        })
      }

      if (window.ScrollTrigger) {
        ScrollTrigger.refresh()
      }

      return () => {
        if (window.ScrollTrigger) {
          ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
        }
      }
    },
  )
}

function initReelScenes() {
  if (!window.gsap || prefersReducedMotion) return

  document.querySelectorAll('.reel-scene').forEach((scene) => {
    const titleWords = scene.querySelectorAll('.word')
    const visual = scene.querySelector('.reel-visual')
    const caption = document.querySelector('.caption-bar')

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scene,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
        pin: true,
      },
    })

    tl.fromTo(titleWords, { yPercent: 100 }, { yPercent: 0, stagger: 0.04, ease: 'power3.out' }, 0)
      .fromTo(scene.querySelector('.reel-copy'), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, 0.15)

    if (visual) {
      tl.fromTo(visual, { y: 32, scale: 0.96, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1 }, 0.28)
    }

    if (caption) {
      tl.to(caption, { autoAlpha: 1, y: 0 }, 0.12)
    }
  })
}

function initStoryboard() {
  if (!window.gsap || prefersReducedMotion) return

  gsap.from('.shot', {
    y: 30,
    autoAlpha: 0,
    stagger: 0.08,
    scrollTrigger: {
      trigger: '.storyboard',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
  })
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.ScrollTrigger && window.gsap) {
    gsap.registerPlugin(ScrollTrigger)
  }

  initSharedAnimations()
  initReelScenes()
  initStoryboard()
})
