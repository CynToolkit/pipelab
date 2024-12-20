import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Pipelab Documentation",
  description: "Pipelab Documentation",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide' },
      { text: 'Reference', link: '/reference' },
      // { text: 'Blog', link: '/blog' },
      { text: 'Website', link: 'https://pipelab.app' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Pipelab?', link: '/guide/what-is-pipelab' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ]
      },
      {
        text: 'App',
        items: [

        ]
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Electron', link: '/guide/integrations/electron' },
          { text: 'Godot', link: '/guide/integrations/godot' },
          { text: 'Construct 3', link: '/guide/integrations/construct_3' },
          { text: 'Unity', link: '/guide/integrations/unity' },
          { text: 'GDevelop', link: '/guide/integrations/gdevelop' },
          { text: 'Tauri', link: '/guide/integrations/tauri' },
          { text: 'Neutralino', link: '/guide/integrations/neutralino' },
          { text: 'Itch.io', link: '/guide/integrations/itch_io' },
          { text: 'Steam', link: '/guide/integrations/steam' },
          { text: 'Epic Game Store', link: '/guide/integrations/epic_game_store' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CynToolkit/pipelab' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Armaldio'
    }
  }
})
