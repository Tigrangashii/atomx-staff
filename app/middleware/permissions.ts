export default defineNuxtRouteMiddleware(async (to) => {
  const supabase = useSupabaseClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user?.id) return navigateTo('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  const role = profile?.role || 'user'
  const managerOnlyRoutes = ['/staff', '/reports/team', '/leaves/calendar']
  const ownerOnlyRoutes = ['/projects']

  if (managerOnlyRoutes.some((route) => to.path === route || to.path.startsWith(`${route}/`)) && !['owner', 'manager'].includes(role)) {
    return navigateTo('/')
  }
  if (ownerOnlyRoutes.some((route) => to.path === route || to.path.startsWith(`${route}/`)) && role !== 'owner') {
    return navigateTo('/')
  }
})
