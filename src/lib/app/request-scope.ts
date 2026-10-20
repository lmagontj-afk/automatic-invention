/** A completed request may publish data only while its context is current.
 * begin() also prevents an older request in the same context winning a race.
 */
export class RequestScope {
  private revision = 0;
  invalidate() {
    this.revision++;
  }
  capture(): () => boolean {
    const revision = this.revision;
    return () => revision === this.revision;
  }
  begin(): () => boolean {
    this.invalidate();
    return this.capture();
  }
}
