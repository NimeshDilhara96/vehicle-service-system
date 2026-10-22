/**
 * Split-screen layout shared by Login and Register pages.
 * - Desktop (lg+): navy hero panel on the left, light panel with a centered card on the right.
 * - Mobile: navy hero header on top, white rounded "sheet" with the form below.
 */
function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#13294b] lg:flex-row">
      {/* Hero panel */}
      <div className="flex flex-col px-6 pt-8 pb-10 text-white sm:px-10 lg:w-1/2 lg:justify-between lg:px-14 lg:py-12">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-5 rounded-[5px] bg-orange-700 lg:h-6 lg:w-6" />
          <span className="text-sm font-bold tracking-tight lg:text-base">
            Vehicle Service
          </span>
        </div>

        {/* Headline */}
        <div className="mt-6 lg:mt-0 lg:max-w-md">
          <h1 className="text-[1.65rem] leading-tight font-bold tracking-tight sm:text-3xl lg:text-[2.6rem] lg:leading-[1.15]">
            Service your vehicle without leaving your desk.
          </h1>
          <p className="mt-3 text-sm text-white/80 lg:mt-5 lg:text-base lg:leading-relaxed">
            <span className="lg:hidden">
              We pick it up, you track it, we bring it back.
            </span>
            <span className="hidden lg:inline">
              Book online, we collect your vehicle, you follow it on the map,
              and we bring it back.
            </span>
          </p>
        </div>

        {/* Feature highlights (desktop only) */}
        <ul className="hidden flex-wrap gap-x-8 gap-y-2 text-sm text-white/80 lg:flex">
          <li>Pickup &amp; delivery</li>
          <li>Live tracking</li>
          <li>Approve extra work</li>
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 rounded-t-[1.75rem] bg-white lg:w-1/2 lg:items-center lg:justify-center lg:rounded-none lg:bg-[#f8f9fa] lg:px-10 lg:py-12">
        <div className="w-full px-6 pt-7 pb-10 sm:px-10 lg:max-w-[420px] lg:rounded-2xl lg:border lg:border-gray-200/90 lg:bg-white lg:p-9 lg:shadow-xs [&_label]:text-xs [&_label]:font-semibold [&_label]:text-[#13294b]">
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-[#13294b] lg:text-2xl">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1.5 hidden text-sm text-slate-500 lg:block">
                {subtitle}
              </p>
            )}
          </div>

          {children}

          {footer && (
            <p className="mt-6 text-center text-xs text-slate-500 sm:text-sm">
              {footer}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;

