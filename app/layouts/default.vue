<template>
  <UDashboardGroup :ui="{ base: 'relative flex min-h-screen overflow-visible' }">
    <AppSidebar />

    <UDashboardPanel class="min-h-screen flex-1" :ui="{ root: 'min-h-screen', body: 'overflow-visible' }">
      <template #header>
        <UDashboardNavbar title="Menaxhimi i stafit">
          <template #right>
            <div class="hidden items-center gap-3 sm:flex">
              <div class="avatar">U</div>
              <div>
                <strong class="block text-sm text-highlighted">Përdoruesi</strong>
                <span class="block text-xs text-muted">Administrator</span>
              </div>
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <main class="page-content pt-16 sm:pt-0">
        <UDashboardSidebarToggle
          class="fixed left-4 top-4 z-50 sm:hidden"
          color="neutral"
          variant="outline"
          size="lg"
          aria-label="Hap menunë"
        />
        <slot />
      </main>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
