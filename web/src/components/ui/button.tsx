import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-md3 hover:shadow-md3-lg hover:brightness-110',
        destructive:
          'bg-destructive text-destructive-foreground shadow-md3 hover:shadow-md3-lg hover:brightness-110',
        outline:
          'border border-outline bg-transparent text-foreground hover:bg-accent',
        secondary:
          'bg-secondary text-secondary-foreground shadow-md3 hover:shadow-md3-lg hover:brightness-110',
        ghost:
          'hover:bg-accent text-foreground',
        link:
          'text-primary underline-offset-4 hover:underline',
        tonal:
          'bg-primary-container text-on-primary-container hover:brightness-95',
      },
      size: {
        default: 'h-10 px-6 py-2 rounded-full',
        sm: 'h-9 px-4 rounded-full',
        lg: 'h-12 px-8 rounded-full',
        icon: 'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
