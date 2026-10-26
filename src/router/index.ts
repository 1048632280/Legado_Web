import { createWebHashHistory, createRouter } from 'vue-router'
import { bookRoutes } from './bookRouter'

const router = createRouter({
  history: createWebHashHistory(),
  routes: bookRoutes,
})

router.afterEach(to => {
  const routeTitles: Record<string, string> = {
    shelf: '书架',
    chapter: '阅读',
  }
  const routeTitle = routeTitles[String(to.name)]
  document.title = routeTitle ? `${routeTitle} - 本地 TXT 阅读器` : '本地 TXT 阅读器'
})

export default router
