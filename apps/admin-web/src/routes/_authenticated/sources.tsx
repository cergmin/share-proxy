import { createFileRoute } from '@tanstack/react-router'
import { Sources } from '../../pages/Sources'

export const Route = createFileRoute('/_authenticated/sources')({
    component: Sources,
})
