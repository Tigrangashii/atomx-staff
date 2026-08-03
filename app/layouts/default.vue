<template>
  <UDashboardGroup
    :ui="{ base: 'relative flex min-h-screen overflow-visible' }"
  >
    <AppSidebar />

    <UDashboardPanel
      class="min-h-screen flex-1"
      :ui="{ root: 'min-h-screen', body: 'overflow-visible' }"
    >
      <AppHeader />

      <main class="page-content pt-0">
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
