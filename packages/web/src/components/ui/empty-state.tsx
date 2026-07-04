import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  className?: string
}

export function EmptyState({ icon, title, description, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      <div className="rounded-full bg-muted p-3 mb-3">
        {icon || <InboxIcon className="h-6 w-6 text-muted-foreground" />}
      </div>
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  )
}
