import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client'
import { Layout } from '../components/Layout'

function AuthenticatedComponent() {
    return (
        <Layout>
            <Outlet />
        </Layout>
    )
}

export const Route = createFileRoute('/_authenticated')({
    beforeLoad: async () => {
        const { data: session } = await authClient.getSession()
        if (!session) {
            throw redirect({ to: '/login' })
        }
    },
    component: AuthenticatedComponent,
})
