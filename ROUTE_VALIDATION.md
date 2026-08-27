# Direct Route Validation

On 27 August 2026, direct navigation in the managed preview was checked for `/super-admin/login`, `/super-admin`, `/admin`, `/teacher`, and `/student`. The owner login route rendered the dedicated email/password form. The protected Super Admin, Admin, and Teacher paths rendered their intended session boundary instead of the home page or a 404 when no owner/institution session was available. The Student path resolved to the Student assessment console and loaded its server-assigned assessment query state. The public home page rendered a dedicated Platform owner sign-in link.

These checks verify client route resolution and protected boundary behavior. They do not replace manual submission of the private Super Admin credentials or a multi-account Teacher-to-Student acceptance pass.
