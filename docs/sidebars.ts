import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    'architecture',
    {
      type: 'category',
      label: 'Channels',
      collapsed: false,
      items: [
        'channels/overview',
        'channels/email',
        'channels/sms',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: [
        'api/send',
        'api/messages',
        'api/admin',
      ],
    },
    'templates',
    'tokens',
    {
      type: 'category',
      label: 'Deployment',
      collapsed: false,
      items: [
        'deployment/docker',
        'deployment/vps',
      ],
    },
    'development',
    'contributing',
  ],
};

export default sidebars;
