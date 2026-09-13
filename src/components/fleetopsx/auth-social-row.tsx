import { Github } from "lucide-react";

/**
 * Figma 37:35 / 42:1489 / 42:959 — social sign-in row on desktop auth cards.
 * Sits between Username and Password on Sign In frames; between subtitle and
 * input on New Password. Desktop only (mobile frames omit it).
 */
export function AuthSocialRow() {
  return (
    <div className="hidden w-full items-center justify-between lg:flex">
      <div className="flex items-center gap-[24px]">
        <button
          type="button"
          className="flex h-[36px] items-center gap-[8px] rounded-[4px] border border-[#e2e5e9] bg-[#fafafa] px-[26px] transition-colors hover:bg-[#f1f2f4]"
        >
          <Github className="h-[18px] w-[18px] text-[#141a1f]" strokeWidth={1.5} />
          <span className="text-[14px] font-[400] leading-[20px] tracking-[0.4px] text-[#141a1f]">GitHub</span>
        </button>
        <button
          type="button"
          className="flex h-[36px] items-center gap-[8px] rounded-[4px] border border-[#e2e5e9] bg-[#fafafa] px-[26px] transition-colors hover:bg-[#f1f2f4]"
        >
          <GoogleIcon />
          <span className="text-[14px] font-[400] leading-[20px] tracking-[0.4px] text-[#141a1f]">Google</span>
        </button>
      </div>
      <span className="text-[12px] font-[400] text-[#5c6470]">Or continue with</span>
    </div>
  );
}

/** Google four-colour "G" mark, sized like the Figma Img glyph. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436a4.14 4.14 0 0 1-1.796 2.716v2.2591h2.9087c1.7017-1.5668 2.6837-3.874 2.6837-6.6156Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.806 5.9563-2.1805l-2.9087-2.2591c-.8059.54-1.8368.859-3.0476.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318A8.99723 8.99723 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 8.70945c-.18-.54-.28227-1.11683-.28227-1.70945s.10227-1.16945.28227-1.70945V2.95091H.957348C.347711 4.17318 0 5.54773 0 6.99999c0 1.45226.347711 2.82681.957348 4.04908L3.964 8.70945Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.57955c1.3214 0 2.5077.45409 3.4405 1.34591l2.5813-2.58136C13.4632.891818 11.426 0 9 0A8.99723 8.99723 0 0 0 .957348 2.95091L3.964 5.29055C4.6718 3.16318 6.656 3.57955 9 3.57955Z"
        fill="#EA4335"
      />
    </svg>
  );
}
