import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Translate, {translate} from '@docusaurus/Translate';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const features = [
  {
    title: translate({message: 'Multi-Channel', id: 'homepage.feature.multiChannel.title'}),
    icon: '📡',
    desc: translate({message: 'Email (SMTP), SMS (Twilio, Aliyun, Tencent) via a unified API.', id: 'homepage.feature.multiChannel.desc'}),
  },
  {
    title: translate({message: 'Self-Hosted', id: 'homepage.feature.selfHosted.title'}),
    icon: '🏠',
    desc: translate({message: 'Deploy with Docker on your own VPS. Your data stays on your server.', id: 'homepage.feature.selfHosted.desc'}),
  },
  {
    title: translate({message: 'Reliable Delivery', id: 'homepage.feature.reliableDelivery.title'}),
    icon: '🔄',
    desc: translate({message: 'Message queue with exponential backoff retry and dead letter queue.', id: 'homepage.feature.reliableDelivery.desc'}),
  },
  {
    title: translate({message: 'Templates', id: 'homepage.feature.templates.title'}),
    icon: '📝',
    desc: translate({message: 'Reusable templates with {{variable}} interpolation per channel type.', id: 'homepage.feature.templates.desc'}),
  },
  {
    title: translate({message: 'Scoped Tokens', id: 'homepage.feature.scopedTokens.title'}),
    icon: '🔑',
    desc: translate({message: 'Per-user API tokens with rate limits and IP whitelisting.', id: 'homepage.feature.scopedTokens.desc'}),
  },
  {
    title: translate({message: 'Multi-User', id: 'homepage.feature.multiUser.title'}),
    icon: '👥',
    desc: translate({message: 'Role-based access. Admin manages users; each user has isolated resources.', id: 'homepage.feature.multiUser.desc'}),
  },
];

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">{siteConfig.title}</Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/getting-started">
            <Translate id="homepage.cta.getStarted">Get Started →</Translate>
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/api/send" style={{marginLeft: '1rem'}}>
            <Translate id="homepage.cta.apiReference">API Reference</Translate>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              {features.map((f, i) => (
                <div key={i} className={clsx('col col--4')} style={{marginBottom: '1.5rem'}}>
                  <div className="feature-card">
                    <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>{f.icon}</div>
                    <Heading as="h3">{f.title}</Heading>
                    <p>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section style={{padding: '2rem 0 4rem', textAlign: 'center'}}>
          <div className="container">
            <Heading as="h2">
              <Translate id="homepage.howItWorks.title">How It Works</Translate>
            </Heading>
            <div style={{maxWidth: '700px', margin: '1.5rem auto'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap'}}>
                {[
                  translate({message: 'Your App', id: 'homepage.flow.app'}),
                  '→',
                  translate({message: 'NotifyHub API', id: 'homepage.flow.api'}),
                  '→',
                  translate({message: 'Queue', id: 'homepage.flow.queue'}),
                  '→',
                  translate({message: 'Channel', id: 'homepage.flow.channel'}),
                  '→',
                  translate({message: 'Recipient', id: 'homepage.flow.recipient'}),
                ].map((s, i) => (
                  <span key={i} className="flow-step" style={{
                    background: s === '→' ? 'transparent' : 'var(--ifm-color-primary)',
                    color: s === '→' ? 'var(--ifm-color-emphasis-600)' : 'white',
                    fontWeight: s === '→' ? 'normal' : '600',
                    fontSize: s === '→' ? '1.2rem' : '0.85rem',
                  }}>{s}</span>
                ))}
              </div>
              <p style={{marginTop: '1.5rem', color: 'var(--ifm-color-emphasis-700)'}}>
                <Translate id="homepage.howItWorks.desc">
                  Send a notification with a single API call. NotifyHub handles routing, retries, and delivery tracking.
                </Translate>
              </p>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
