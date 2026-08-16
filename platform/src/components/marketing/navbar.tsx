"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/images/logo.png";

const navLinks = [
  { label: "Funcionalidades", href: "#features" },
  { label: "Cómo funciona", href: "#how-it-works" },
  { label: "Precios", href: "#pricing" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image src={logo} alt="WizyDoc" className="h-8 w-auto" priority />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-gray hover:text-brand-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Comenzar gratis</Link>
            </Button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden rounded-md p-2 text-gray-500 hover:bg-gray-100"
            onClick={() => setOpen(!open)}
            aria-label="Abrir menú"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-brand-gray hover:text-brand-ink"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" asChild className="w-full">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button asChild className="w-full">
              <Link href="/register">Comenzar gratis</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
