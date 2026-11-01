import axios from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;     //This is a try to push lib/folder to github 
  }
  return config;
});

export function setToken(token: string) {
  Cookies.set("token", token, { expires: 1 });
}

export function clearToken() {
  Cookies.remove("token");
}

export function getToken() {
  return Cookies.get("token");
}

export default api;
