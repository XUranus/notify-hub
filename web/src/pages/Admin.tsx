import { Shield, Users, HardDrive, Trash, FileText } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from '@/lib/i18n'
import AdminUsers from './admin/Users'
import AdminSystem from './admin/System'
import AdminCleanup from './admin/Cleanup'
import AdminLogs from './admin/Logs'

export default function Admin() {
  const { t } = useTranslation()

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight mb-6">{t('nav.admin')}</h2>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            {t('nav.users')}
          </TabsTrigger>
          <TabsTrigger value="system">
            <HardDrive className="h-4 w-4 mr-2" />
            {t('nav.system')}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <FileText className="h-4 w-4 mr-2" />
            {t('nav.logs')}
          </TabsTrigger>
          <TabsTrigger value="cleanup">
            <Trash className="h-4 w-4 mr-2" />
            {t('nav.cleanup')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminUsers />
        </TabsContent>

        <TabsContent value="system">
          <AdminSystem />
        </TabsContent>

        <TabsContent value="logs">
          <AdminLogs />
        </TabsContent>

        <TabsContent value="cleanup">
          <AdminCleanup />
        </TabsContent>
      </Tabs>
    </div>
  )
}
