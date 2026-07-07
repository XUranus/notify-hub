import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmOptions {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

interface AlertOptions {
  title?: string
  description: string
  confirmLabel?: string
}

interface DialogState {
  open: boolean
  mode: 'confirm' | 'alert'
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

const defaultState: DialogState = {
  open: false,
  mode: 'confirm',
  description: '',
}

export function useConfirm() {
  const [state, setState] = useState<DialogState>(defaultState)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({
        open: true,
        mode: 'confirm',
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        variant: options.variant,
      })
    })
  }, [])

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = () => resolve()
      setState({
        open: true,
        mode: 'alert',
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    setState((s) => ({ ...s, open: false }))
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    setState((s) => ({ ...s, open: false }))
    resolveRef.current = null
  }, [])

  const ConfirmDialog = (
    <Dialog open={state.open} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state.title || (state.mode === 'alert' ? 'Notice' : 'Confirm')}</DialogTitle>
          <DialogDescription>{state.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {state.mode === 'confirm' && (
            <Button variant="outline" onClick={handleCancel}>
              {state.cancelLabel || 'Cancel'}
            </Button>
          )}
          <Button
            variant={state.variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
          >
            {state.confirmLabel || (state.mode === 'alert' ? 'OK' : 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { confirm, alert, ConfirmDialog }
}
