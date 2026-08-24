import {
    ContestModel, Context,
    ForbiddenError, Handler, ObjectId, PERM, PRIV,
    Schema, SettingModel, Logger, UserModel, DocumentModel, UserNotFoundError, param, Types
} from 'hydrooj';
const logger = new Logger('anti-cheat');

export const Config = Schema.object({
    enabled: Schema.boolean().default(false).description('Enable anti-cheat mode'),
    forbidJoinOtherContest: Schema.boolean().default(false).description('Forbid joining other contests while in an ongoing contest'),
});

class ManageAntiCheatModeHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const enabled = !!this.ctx.setting.get('hsoj-anti-cheat.enabled');
        const forbidJoinOtherContest = !!this.ctx.setting.get('hsoj-anti-cheat.forbidJoinOtherContest');

        this.response.template = 'manage_anti_cheat.html';
        this.response.body = {
            enabled,
            forbidJoinOtherContest,
            saved: this.args.saved === '1',
            reset: this.args.reset === '1',
            resetUname: this.args.resetUname || null,
        };
    }

    @param('enabled', Types.Boolean)
    @param('forbidJoinOtherContest', Types.Boolean)
    async postSave(
        domainId: string, enabled: boolean, forbidJoinOtherContest: boolean,
    ) {
        await Promise.all([
            this.ctx.setting.setConfig('hsoj-anti-cheat.enabled', enabled),
            this.ctx.setting.setConfig('hsoj-anti-cheat.forbidJoinOtherContest', forbidJoinOtherContest),
        ]);
        this.response.redirect = this.url('manage_anti_cheat', { query: { saved: '1' } });
    }

    @param('uname', Types.Username)
    @param('hisDomainId', Types.String, true)
    @param('tid', Types.ObjectId, true)
    async postReset(
        domainId: string, uname: string, hisDomainId = '', tid?: ObjectId,
    ) {
        let udoc = await UserModel.getByUname('system', uname);
        if (!udoc) throw new UserNotFoundError(uname);
        const uid = udoc._id;
        if (tid) {
            const did = hisDomainId || 'system';
            const tdoc = await ContestModel.get(did, tid);
            await UserModel.setById(uid, { lastContest: { domainId: tdoc.domainId, tid: tdoc.docId.toHexString() } });
        }else{
            await UserModel.setById(uid, { lastContest: {} });
        }
        
        this.response.redirect = this.url('manage_anti_cheat', { query: { reset: '1', resetUname: uname } });
    }
}

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
    ctx.injectUI('ControlPanel', 'manage_anti_cheat', { before: 'manage_config' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_anti_cheat', '/manage/anti-cheat', ManageAntiCheatModeHandler, PRIV.PRIV_EDIT_SYSTEM);

    ctx.inject(['setting'], (c: any) => {
        c.setting.AccountSetting(
            SettingModel.Setting('setting_storage', 'lastContest', {}, 'json', 'LastContestAttend', null, SettingModel.FLAG_DISABLED | SettingModel.FLAG_PUBLIC),
        );
    });
    ctx.i18n.load('zh', {
        manage_anti_cheat: '反作弊模式',
        'Anti Cheat Mode': '反作弊模式',
        'Enable Anti Cheat Mode': '启用反作弊模式',
        'Forbid Join Other Contest': '当前比赛进行中禁止参加其他比赛',
        'When multiple tournaments are being held simultaneously, we recommend enabling the option to prohibit participation in other tournaments while a current tournament is in progress, to prevent cheating by taking advantage of multiple tournaments.': '同时举行多个比赛的情况下建议启用当前比赛进行中禁止参加其他比赛选项，防止利用多个比赛进行作弊',
        'Enabling anti-cheating mode will prevent contestants from viewing other problems and the code submitted before the competition begins, and will log the IP addresses of submissions.': '开启反作弊模式，会禁止参赛者查看其他题目和比赛开始前的作答代码，并且会在日志中记录提交的ip',
        Saved: '已保存',
        'Reset User Last Contest': '重置用户生效比赛',
        'Domain ID': '域ID',
        'Contest ID (24-digit hex ObjectId)': '比赛ID（24位十六进制ObjectId）',
        Reset: '重置',
        'Last contest reset for user {0}.': '用户 {0} 的生效比赛已重置。',
        'Leave both Domain ID and Contest ID empty to clear the last contest. Leave only Domain ID empty to default to system domain.': '域ID和比赛ID都留空则清除生效比赛。仅域ID留空则默认为system域。',
    });
    ctx.i18n.load('en', {
        manage_anti_cheat: 'Anti Cheat Mode',
        'Forbid Join Other Contest': 'Forbid joining other contests while in an ongoing contest',
        'Reset User Last Contest': 'Reset User Last Contest',
        'Domain ID': 'Domain ID',
        'Contest ID (24-digit hex ObjectId)': 'Contest ID (24-digit hex ObjectId)',
        Reset: 'Reset',
        'Last contest reset for user {0}.': 'Last contest reset for user {0}.',
        'Leave both Domain ID and Contest ID empty to clear the last contest. Leave only Domain ID empty to default to system domain.': 'Leave both Domain ID and Contest ID empty to clear the last contest. Leave only Domain ID empty to default to system domain.',
    });

    ctx.on('handler/after/ContestDetail#post', async (that: any) => {
        if (!(that.args.operation === 'attend')) return;
        await UserModel.setById(that.user._id, { lastContest: { domainId: that.tdoc.domainId || 'system', tid: that.tdoc.docId.toHexString() } });
    });

    if (!config.enabled) return;

    ctx.on('handler/before/ContestDetail#post', async (that: any) => {
        if (!(that.args.operation === 'attend')) return;
        if (!config.forbidJoinOtherContest ) return;
        if (that.user.hasPerm(PERM.PERM_CREATE_CONTEST)) return;
        if (!that.user.lastContest?.tid || (that.args.tid && that.args.tid === that.user.lastContest.tid)) return;
        const toid = ObjectId.createFromHexString(that.user.lastContest.tid);
        const tdoc = await DocumentModel.get(that.user.lastContest.domainId, DocumentModel.TYPE_CONTEST, toid);
        if (!tdoc) return;
        if ( !ContestModel.isDone(tdoc)) {
            throw new ForbiddenError('Cannot join another contest while in an ongoing contest [Anti Cheat Mode]');
        }
    });

    ctx.on('handler/before/ProblemDetail#get', async (that: any) => {
        if (!that.user._id || that.user._id === 0) {
            throw new ForbiddenError('Not available now [Anti Cheat Mode]');
        }
        if (that.user.hasPerm(PERM.PERM_CREATE_CONTEST)) return;
        if (!that.user.lastContest?.tid || (that.args.tid && that.args.tid === that.user.lastContest.tid)) return;
        const toid = ObjectId.createFromHexString(that.user.lastContest.tid);
        const tdoc = await DocumentModel.get(that.user.lastContest.domainId, DocumentModel.TYPE_CONTEST, toid);
        if (!tdoc) return;
        if (ContestModel.isOngoing(tdoc)) {
            throw new ForbiddenError('Not available now [Anti Cheat Mode]');
        }
    });
    ctx.on('handler/after/RecordDetail#get', async (that: any) => {
        if (!that.user._id || that.user._id === 0) return;
        if (that.user.hasPerm(PERM.PERM_CREATE_CONTEST)) return;
        if (!that.user.lastContest?.tid) return;
        const toid = ObjectId.createFromHexString(that.user.lastContest.tid);
        const tdoc = await DocumentModel.get(that.user.lastContest.domainId, DocumentModel.TYPE_CONTEST, toid);
        if (!tdoc) return;
        if (ContestModel.isOngoing(tdoc) && (tdoc?.beginAt && that.rdoc._id.getTimestamp() < tdoc.beginAt)) {
            throw new ForbiddenError('Not available now [Anti Cheat Mode]');
        }
    });

    ctx.on('handler/before/HomeMessages#get', async (that: any)=> {
        if (!that.user._id || that.user._id === 0) return;
        if (that.user.hasPerm(PERM.PERM_CREATE_CONTEST)) return;
        if (!that.user.lastContest?.tid) return;
        const toid = ObjectId.createFromHexString(that.user.lastContest.tid);
        const tdoc = await DocumentModel.get(that.user.lastContest.domainId, DocumentModel.TYPE_CONTEST, toid);
        if (!tdoc) return;
        if (ContestModel.isOngoing(tdoc)) {
            throw new ForbiddenError('Not available now [Anti Cheat Mode]');
        }
    })

    ctx.on('handler/before/DiscussionDetail#get', async (that: any)=> {
        if (!that.user._id || that.user._id === 0) return;
        if (that.user.hasPerm(PERM.PERM_CREATE_CONTEST)) return;
        if (!that.user.lastContest?.tid) return;
        const toid = ObjectId.createFromHexString(that.user.lastContest.tid);
        const tdoc = await DocumentModel.get(that.user.lastContest.domainId, DocumentModel.TYPE_CONTEST, toid);
        if (!tdoc) return;
        if (ContestModel.isOngoing(tdoc)) {
            throw new ForbiddenError('Not available now [Anti Cheat Mode]');
        }
    })

    ctx.on('handler/after/ProblemSubmit#post', (that: any) => {
        if (that.session.uid && that.session.uid !== 0 && that.request.query.tid) {
            logger.info(JSON.stringify({ contestSubmit: true, uid: that.user._id, uname: that.user.uname, ip: that.request.ip, contestID: that.args.tid, problemID: that.pdoc.docId }));
        }
    });

}
