"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type UpdateItem = {
  id: string;
  title: string;
  providerId: string;
  updatedAt: string;
};

export default function UpdatesPage() {
  const [items, setItems] = useState<UpdateItem[]>([]);

  useEffect(() => {
    apiFetch<UpdateItem[]>("/updates").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title">
          <h1>Updates</h1>
          <p>Recent library-side activity and refreshed records.</p>
        </div>
      </section>
      <section className="list">
        {items.map((item) => (
          <article className="list-item" key={item.id}>
            <div className="list-item-main">
              <strong>{item.title}</strong>
              <p>{item.providerId}</p>
            </div>
            <span className="badge">{new Date(item.updatedAt).toLocaleString()}</span>
          </article>
        ))}
      </section>
    </div>
  );
}
