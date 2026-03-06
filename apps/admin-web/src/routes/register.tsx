import { createFileRoute, redirect } from '@tanstack/react-router'
import { Register } from '../pages/Register'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/register')({
    beforeLoad: async () => {
        const { data: session } = await authClient.getSession()
        if (session) {
            throw redirect({ to: '/' })
        }
    },
    component: Register,
})
