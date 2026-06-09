import { useI18n } from '../i18n'

/** Ambient, on-brand hero art: a chain of links (the "lien" motif) with light
 * flowing through it — suggesting value moving along a chain of claims. Pure SVG
 * + SMIL (no canvas/JS), low-key, and disabled under prefers-reduced-motion. */
function HeroArt() {
  return (
    <svg viewBox="0 0 280 170" className="hero-art-svg" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="lienLg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6aa0ff" />
          <stop offset="1" stopColor="#bcd4ff" />
        </linearGradient>
        <radialGradient id="lienGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#6aa0ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#6aa0ff" stopOpacity="0" />
        </radialGradient>
        <path id="lienFlow" d="M30 97 H250" fill="none" />
      </defs>
      <ellipse cx="140" cy="92" rx="120" ry="82" fill="url(#lienGlow)" />
      <g className="chain" fill="none" stroke="url(#lienLg)" strokeWidth="3.4">
        <rect x="34" y="80" width="46" height="34" rx="17" />
        <rect x="74" y="80" width="46" height="34" rx="17" />
        <rect x="114" y="80" width="46" height="34" rx="17" />
        <rect x="154" y="80" width="46" height="34" rx="17" />
        <rect x="194" y="80" width="46" height="34" rx="17" />
      </g>
      <g className="flowdots">
        <circle r="3.4" fill="#e8f0ff">
          <animateMotion dur="3.6s" repeatCount="indefinite">
            <mpath href="#lienFlow" />
          </animateMotion>
        </circle>
        <circle r="2.6" fill="#9bc0ff">
          <animateMotion dur="3.6s" begin="1.2s" repeatCount="indefinite">
            <mpath href="#lienFlow" />
          </animateMotion>
        </circle>
        <circle r="2.2" fill="#6aa0ff">
          <animateMotion dur="3.6s" begin="2.4s" repeatCount="indefinite">
            <mpath href="#lienFlow" />
          </animateMotion>
        </circle>
      </g>
    </svg>
  )
}

export function Hero() {
  const { t } = useI18n()
  return (
    <div className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="hero-text">
        <h1>{t('hero.headline')}</h1>
        <p>{t('hero.sub')}</p>
        <div className="namecard">
          <span className="term">
            lien <span className="ipa">/liːn/ · {t('hero.noun')}</span>
          </span>
          <span className="def">{t('hero.def')}</span>
        </div>
      </div>
      <div className="hero-art">
        <HeroArt />
      </div>
    </div>
  )
}

export function HowItWorks() {
  const { t } = useI18n()
  const steps = [
    { title: t('how.s1t'), desc: t('how.s1d') },
    { title: t('how.s2t'), desc: t('how.s2d') },
    { title: t('how.s3t'), desc: t('how.s3d') },
  ]
  return (
    <div className="how">
      <div className="section-title">{t('how.title')}</div>
      <div className="steps">
        {steps.map((s, i) => (
          <div className="step" key={i}>
            <div className="step-num">{i + 1}</div>
            <div className="step-title">{s.title}</div>
            <div className="step-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
