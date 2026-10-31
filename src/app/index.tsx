import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, KeyboardAvoidingView, Platform, Alert, SafeAreaView, Image, ScrollView
} from 'react-native';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut, User } from 'firebase/auth';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';

// --- SUAS CREDENCIAIS DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyA_7pkYP8JVfY7WatbGxMPCsJwaQZC-ig0",
  authDomain: "projeto-app-fitnes.firebaseapp.com",
  projectId: "projeto-app-fitnes",
  storageBucket: "projeto-app-fitnes.firebasestorage.app",
  messagingSenderId: "91996067143",
  appId: "1:91996067143:web:201f028aa42cfb60246862",
  measurementId: "G-67EZ81ECYE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

interface Atividade {
  id: string;
  nome: string;
  tempo: number;
  data: string;
  userId?: string;
  photoURL?: string;
}

interface RankingItem {
  nome: string;
  totalMinutos: number;
  photoURL: string | null;
}

export default function IndexScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<'home' | 'profile'>('home');

  // Estados de Autenticação
  const [isLoginState, setIsLoginState] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomeRegistro, setNomeRegistro] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Estados de Treino e Dados
  const [tempo, setTempo] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [meusTreinos, setMeusTreinos] = useState<Atividade[]>([]);
  const [savingTreino, setSavingTreino] = useState(false);

  // Estados do Perfil
  const [editNome, setEditNome] = useState('');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [editingTreinoId, setEditingTreinoId] = useState<string | null>(null);
  const [editTreinoTempo, setEditTreinoTempo] = useState('');

  // Monitorar Login e buscar foto do Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setEditNome(currentUser.displayName || '');
        const userDocRef = doc(db, "usuarios", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data().photoURL) {
          setUserPhoto(userSnap.data().photoURL);
        }
      }
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  // Sincronização em tempo real do Banco de Dados
  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, "atividades"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const atividadesList: Atividade[] = [];
      snapshot.forEach((document) => {
        atividadesList.push({ id: document.id, ...document.data() } as Atividade);
      });

      const meus = atividadesList.filter(t => t.userId === user.uid || t.nome === user.displayName || t.nome === getPrimeiroNome());
      meus.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setMeusTreinos(meus);

      const acumulado = atividadesList.reduce((acc, curr) => {
        const nomeFormatado = curr.nome?.trim() || 'Anônimo';
        const minutos = Number(curr.tempo) || 0;
        
        if (!acc[nomeFormatado]) {
          acc[nomeFormatado] = { total: 0, photo: curr.photoURL || null };
        }
        acc[nomeFormatado].total += minutos;
        if (curr.photoURL) acc[nomeFormatado].photo = curr.photoURL;
        return acc;
      }, {} as Record<string, { total: number, photo: string | null }>);

      const rankingArray = Object.keys(acumulado).map((nomeStr) => ({
        nome: nomeStr,
        totalMinutos: acumulado[nomeStr].total,
        photoURL: acumulado[nomeStr].photo
      })).sort((a, b) => b.totalMinutos - a.totalMinutos);

      setRanking(rankingArray);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAuth = async () => {
    if (!email || !password || (!isLoginState && !nomeRegistro)) return Alert.alert("Atenção", "Preencha tudo!");
    setAuthLoading(true);
    try {
      if (isLoginState) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: nomeRegistro });
        setUser({ ...userCredential.user, displayName: nomeRegistro } as User);
        await setDoc(doc(db, "usuarios", userCredential.user.uid), {
          nome: nomeRegistro,
          photoURL: null
        });
      }
    } catch (error: any) {
      Alert.alert("Erro", error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const getPrimeiroNome = () => {
    let nomeCompleto = user?.displayName;
    if (!nomeCompleto && user?.email) nomeCompleto = user.email.split('@')[0];
    if (!nomeCompleto) return 'Atleta';
    return nomeCompleto;
  };

  const minhaPosicao = () => {
    const pos = ranking.findIndex(r => r.nome === getPrimeiroNome());
    return pos !== -1 ? pos + 1 : '-';
  };

  const salvarPerfilNome = async () => {
    if (!editNome) return Alert.alert("Erro", "O nome não pode ser vazio.");
    try {
      await updateProfile(user!, { displayName: editNome });
      setUser({ ...user, displayName: editNome } as User);
      
      meusTreinos.forEach(async (treino) => {
        await updateDoc(doc(db, "atividades", treino.id), { nome: editNome });
      });
      Alert.alert("Sucesso", "Nome atualizado!");
    } catch (e) {
      Alert.alert("Erro", "Falha ao salvar nome.");
    }
  };

  const escolherFoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.05,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      const photoURL = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setUploadingFoto(true);
      try {
        setUserPhoto(photoURL);

        await setDoc(doc(db, "usuarios", user!.uid), {
          nome: getPrimeiroNome(),
          photoURL: photoURL
        }, { merge: true });

        for (const treino of meusTreinos) {
          await updateDoc(doc(db, "atividades", treino.id), { photoURL });
        }
        
        Alert.alert("Sucesso", "Foto atualizada com sucesso!");
      } catch (e) {
        console.error(e);
        Alert.alert("Erro", "Falha ao carregar a foto.");
      } finally {
        setUploadingFoto(false);
      }
    }
  };

  const handleSubmitTreino = async () => {
    if (!tempo) return Alert.alert("Erro", "Preencha o tempo!");
    setSavingTreino(true);
    try {
      await addDoc(collection(db, "atividades"), {
        nome: getPrimeiroNome(),
        tempo: Number(tempo),
        data: dataSelecionada.toISOString().split('T')[0],
        userId: user!.uid,
        photoURL: userPhoto || null,
        createdAt: new Date()
      });
      setTempo('');
      Alert.alert("Sucesso", "Treino registrado!");
    } catch (error) {
      Alert.alert("Erro", "Falha ao registrar atividade.");
    } finally {
      setSavingTreino(false);
    }
  };

  const salvarEdicaoTreino = async (id: string) => {
    try {
      await updateDoc(doc(db, "atividades", id), { tempo: Number(editTreinoTempo) });
      setEditingTreinoId(null);
      Alert.alert("Sucesso", "Treino atualizado!");
    } catch (e) {
      Alert.alert("Erro", "Não foi possível editar.");
    }
  };

  const apagarTreino = async (id: string) => {
    Alert.alert("Apagar", "Tem certeza que deseja apagar este treino?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: async () => {
          await deleteDoc(doc(db, "atividades", id));
      }}
    ]);
  };

  const formatarTempo = (minutosTotal: number) => {
    const horas = Math.floor(minutosTotal / 60);
    const minutos = minutosTotal % 60;
    if (horas === 0) return `${minutos} min`;
    return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
  };

  if (loadingAuth) return <SafeAreaView style={styles.container}><Text style={{textAlign: 'center', marginTop: 50}}>Carregando...</Text></SafeAreaView>;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.inner}>
          <Text style={styles.title}>{isLoginState ? 'Acessar Conta' : 'Criar Nova Conta'}</Text>
          <View style={styles.formCard}>
            {!isLoginState && (
              <>
                <Text style={styles.label}>Seu Nome:</Text>
                <TextInput style={styles.input} placeholder="Ex: João" value={nomeRegistro} onChangeText={setNomeRegistro} />
              </>
            )}
            <Text style={styles.label}>Email:</Text>
            <TextInput style={styles.input} placeholder="email@exemplo.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            <Text style={styles.label}>Senha:</Text>
            <TextInput style={styles.input} placeholder="******" secureTextEntry value={password} onChangeText={setPassword} />
            <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={authLoading}>
              <Text style={styles.buttonText}>{authLoading ? 'Carregando...' : (isLoginState ? 'Entrar' : 'Registrar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{marginTop: 15}} onPress={() => setIsLoginState(!isLoginState)}>
              <Text style={{textAlign: 'center', color: '#3498db', fontWeight: 'bold'}}>{isLoginState ? 'Não tem conta? Registre-se.' : 'Já tem conta? Entre aqui.'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (currentScreen === 'profile') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
          <ScrollView contentContainerStyle={styles.inner}>
            
            <TouchableOpacity 
              onPress={() => setCurrentScreen('home')} 
              style={{marginBottom: 20, padding: 12, backgroundColor: '#e1f5fe', borderRadius: 8, alignSelf: 'flex-start'}}
            >
              <Text style={{color: '#0288d1', fontWeight: 'bold', fontSize: 16}}>⬅ Voltar para o Ranking</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Meu Perfil</Text>

            <View style={[styles.formCard, { alignItems: 'center' }]}>
              {userPhoto ? (
                <Image source={{ uri: userPhoto }} style={styles.profileImageLarge} />
              ) : (
                <View style={[styles.profileImageLarge, { backgroundColor: '#dfe4ea', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{fontSize: 40}}>👤</Text>
                </View>
              )}
              <TouchableOpacity onPress={escolherFoto} style={{marginTop: 10, padding: 10, backgroundColor: '#f1f2f6', borderRadius: 6}}>
                <Text style={{color: '#2f3640', fontWeight: 'bold'}}>{uploadingFoto ? 'Enviando...' : '📷 Atualizar Foto'}</Text>
              </TouchableOpacity>

              <View style={{width: '100%', marginTop: 20}}>
                <Text style={styles.label}>Editar Nome (Aparece no Ranking):</Text>
                <TextInput style={styles.input} value={editNome} onChangeText={setEditNome} />
                <TouchableOpacity style={styles.button} onPress={salvarPerfilNome}>
                  <Text style={styles.buttonText}>Salvar Nome</Text>
                </TouchableOpacity>
              </View>

              <View style={{marginTop: 20, backgroundColor: '#e0f2f1', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center'}}>
                <Text style={{fontSize: 16, color: '#00796b'}}>Sua posição no Ranking:</Text>
                <Text style={{fontSize: 30, fontWeight: 'bold', color: '#00796b'}}>{minhaPosicao()}º Lugar</Text>
              </View>
            </View>

            <Text style={styles.subtitle}>Meus Lançamentos (Histórico para Edição)</Text>
            {meusTreinos.length === 0 ? <Text style={styles.emptyText}>Nenhum treino encontrado.</Text> : null}
            {meusTreinos.map((treino) => (
              <View key={treino.id} style={styles.rankingItem}>
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 12, color: '#888'}}>{treino.data.split('-').reverse().join('/')}</Text>
                  
                  {editingTreinoId === treino.id ? (
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                      <TextInput 
                        style={[styles.input, {flex: 1, marginBottom: 0, height: 35}]} 
                        keyboardType="numeric" 
                        value={editTreinoTempo} 
                        onChangeText={setEditTreinoTempo} 
                      />
                      <TouchableOpacity onPress={() => salvarEdicaoTreino(treino.id)} style={{marginLeft: 10, backgroundColor: '#2ed573', padding: 8, borderRadius: 6}}>
                        <Text style={{color: '#fff', fontWeight: 'bold'}}>Salvar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={{fontSize: 16, fontWeight: 'bold', color: '#2f3640'}}>{treino.tempo} minutos</Text>
                  )}
                </View>

                {editingTreinoId !== treino.id && (
                  <View style={{flexDirection: 'row', gap: 15, alignItems: 'center'}}>
                    <TouchableOpacity onPress={() => { setEditingTreinoId(treino.id); setEditTreinoTempo(treino.tempo.toString()); }}>
                      <Text style={{fontSize: 18}}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => apagarTreino(treino.id)}>
                      <Text style={{fontSize: 18}}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            
            <TouchableOpacity onPress={() => signOut(auth)} style={{marginTop: 30, padding: 15, alignItems: 'center'}}>
              <Text style={{color: '#e74c3c', fontWeight: 'bold', fontSize: 16}}>Sair da Conta (Logout)</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.inner}>
        
        <View style={styles.headerContainer}>
          <TouchableOpacity 
            onPress={() => setCurrentScreen('profile')} 
            style={styles.profileButton}
          >
            {userPhoto ? (
              <Image source={{uri: userPhoto}} style={styles.profileImageSmall} />
            ) : (
              <View style={[styles.profileImageSmall, {backgroundColor: '#dfe4ea', justifyContent: 'center', alignItems: 'center'}]}><Text style={{fontSize: 18}}>👤</Text></View>
            )}
            <Text style={{ marginLeft: 12, color: '#3498db', fontWeight: 'bold', fontSize: 18 }}>Meu Perfil</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🏆 Ranking</Text>
        </View>

        <Text style={{ marginBottom: 15, fontSize: 16, color: '#57606f' }}>
          Olá, <Text style={{fontWeight: 'bold'}}>{getPrimeiroNome()}</Text>! Você está em <Text style={{fontWeight: 'bold', color: '#e67e22'}}>{minhaPosicao()}º</Text>.
        </Text>

        <View style={styles.formCard}>
          <View style={{flexDirection: 'row', gap: 10}}>
            <View style={{flex: 1}}>
              <Text style={styles.label}>Tempo (minutos):</Text>
              <TextInput style={styles.input} placeholder="Ex: 45" keyboardType="numeric" value={tempo} onChangeText={setTempo} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.label}>Data:</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore
                <input type="date" value={dataSelecionada.toISOString().split('T')[0]} max={new Date().toISOString().split('T')[0]} onChange={(e: any) => { if(e.target.value) { const [y, m, d] = e.target.value.split('-'); setDataSelecionada(new Date(Number(y), Number(m)-1, Number(d))); }}} style={{border: '1px solid #dfe4ea', borderRadius: '6px', padding: '10px', height: '45px', backgroundColor: '#f1f2f6', width: '100%', boxSizing: 'border-box'}} />
              ) : (
                <>
                  <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
                    <Text style={{ color: '#2f3640' }}>{dataSelecionada.toLocaleDateString('pt-BR')}</Text>
                  </TouchableOpacity>
                  {showDatePicker && <DateTimePicker value={dataSelecionada} mode="date" display="default" onChange={(e: any, d?: Date) => {setShowDatePicker(false); if(d) setDataSelecionada(d);}} maximumDate={new Date()} />}
                </>
              )}
            </View>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleSubmitTreino} disabled={savingTreino}>
            <Text style={styles.buttonText}>{savingTreino ? 'Salvando...' : 'Registrar Treino'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>Ranking em Tempo Real</Text>
        <FlatList
          data={ranking}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item, index }) => (
            <View style={styles.rankingItem}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={{fontSize: 18, width: 35}}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`}
                </Text>
                {item.photoURL ? (
                  <Image source={{uri: item.photoURL}} style={styles.rankingImage} />
                ) : (
                  <View style={[styles.rankingImage, {backgroundColor: '#f1f2f6', justifyContent: 'center', alignItems: 'center'}]}><Text style={{fontSize: 14}}>👤</Text></View>
                )}
                <Text style={styles.rankingText}>{item.nome}</Text>
              </View>
              <Text style={styles.rankingBadge}>{formatarTempo(item.totalMinutos)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum treino registrado.</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  inner: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2f3640' },
  headerContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20, 
    marginTop: Platform.OS === 'web' ? 10 : 0,
    zIndex: 999 
  },
  profileButton: {
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14,    // Aumentado para expandir a área de clique vertical
    paddingHorizontal: 20,  // Aumentado para expandir a área de clique horizontal
    backgroundColor: '#fff', 
    borderRadius: 10, 
    borderWidth: 1.5,
    borderColor: '#dcdde1',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    zIndex: 999
  },
  formCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 2 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#57606f' },
  input: { borderWidth: 1, borderColor: '#dfe4ea', borderRadius: 6, padding: 10, height: 45, marginBottom: 12, backgroundColor: '#f1f2f6' },
  button: { backgroundColor: '#2ed573', padding: 12, borderRadius: 6, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#2f3640' },
  rankingItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8, alignItems: 'center', elevation: 1 },
  rankingText: { fontSize: 16, fontWeight: 'bold', color: '#2f3640' },
  rankingBadge: { backgroundColor: '#e0f2f1', color: '#00796b', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontWeight: 'bold', overflow: 'hidden' },
  emptyText: { textAlign: 'center', color: '#a4b0be', marginTop: 20 },
  profileImageSmall: { width: 44, height: 44, borderRadius: 22 }, // Foto ligeiramente maior
  profileImageLarge: { width: 100, height: 100, borderRadius: 50 },
  rankingImage: { width: 30, height: 30, borderRadius: 15, marginRight: 10 }
});