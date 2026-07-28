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

      <main class="page-content">
        <slot />
      </main>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
