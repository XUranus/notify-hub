declare module 'react-syntax-highlighter' {
  import { ComponentType, ReactNode } from 'react'

  interface SyntaxHighlighterProps {
    language?: string
    style?: Record<string, Record<string, string>>
    children?: ReactNode
    customStyle?: Record<string, string | number>
    wrapLongLines?: boolean
    [key: string]: unknown
  }

  export const Prism: ComponentType<SyntaxHighlighterProps>
  export default ComponentType<SyntaxHighlighterProps>
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const oneDark: Record<string, Record<string, string>>
}
