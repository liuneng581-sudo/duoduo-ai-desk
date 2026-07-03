import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// License-activated single-machine app — no account token. On any 401 the server
// is telling us the machine isn't activated; send the user to the activation page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (status === 401 && (code === 'NOT_ACTIVATED' || !code)) {
      if (window.location.pathname !== '/activate') {
        window.location.href = '/activate';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
