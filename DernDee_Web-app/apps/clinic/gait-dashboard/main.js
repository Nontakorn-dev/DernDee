import './styles/main.css';
import { createGaitLabDashboardApp } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = createGaitLabDashboardApp();
  app.init();

  window.addEventListener('beforeunload', () => {
    app.destroy();
  });
});