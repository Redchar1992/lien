import { useI18n } from '../i18n'

export function Hero() {
  const { t } = useI18n()
  return (
    <div className="hero">
      <div className="hero-glow" aria-hidden />
      <h1>{t('hero.headline')}</h1>
      <p>{t('hero.sub')}</p>
      <div className="namecard">
        <span className="term">
          lien <span className="ipa">/liːn/ · {t('hero.noun')}</span>
        </span>
        <span className="def">{t('hero.def')}</span>
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
